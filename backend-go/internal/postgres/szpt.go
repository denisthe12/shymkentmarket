package postgres

import (
	"context"
	"encoding/json"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/szpt"
)

// Group rules arrive as one JSON parameter ($1, szpt.Groups); patterns are data, never SQL text.
// size is the first numeric attribute among size_keys (milk/kefir: volumeMl, else weightGrams).
// by_weight: the group is weighted and every in-stock offer is sold by weight (offer_price_basis). It is
// always false in non-weighted groups, so the view never changes their membership, prices or order.
// Every join to the view also filters b."snapshotId", so PostgreSQL reads the view for one snapshot only.
// A by_weight product needs no package size; unit_weight_exact is its exact per-kg price.
const szptMembersSQL = `WITH g AS (
 SELECT * FROM jsonb_to_recordset($1::jsonb) AS g(slug text,category text,size_keys text[],min_size numeric,
  include text[],exclude text,fat_min numeric,fat_max numeric,weighted boolean)
), usable AS (
 SELECT p.id,p.name,p.brand,c.slug AS category_slug,c.name AS category_name,p."imageUrl",p.attributes,
 MIN(o.price) AS min_price,MAX(o."snapshotAt" AT TIME ZONE 'UTC') AS snapshot_at,
 bool_and(coalesce(b."soldByWeight",false)) AS all_weighted,
 min(o.price::numeric*1000/b."basisGrams") FILTER (WHERE b."soldByWeight") AS unit_weight_exact
 FROM public.canonical_products p JOIN public.categories c ON c.id=p."categoryId"
 JOIN public.offers o ON o."canonicalProductId"=p.id AND o."inStock" AND o.price>0
 LEFT JOIN public.offer_price_basis b ON b."offerId"=o.id AND b."snapshotId"=$2
 WHERE o."snapshotId"=$2
 GROUP BY p.id,c.slug,c.name
), sized AS (
 SELECT u.*,g.slug AS group_slug,g.min_size,g.include,g.exclude,g.fat_min,g.fat_max,
 coalesce(g.weighted AND u.all_weighted,false) AS by_weight,
 (SELECT (u.attributes->>k.key)::numeric FROM unnest(g.size_keys) WITH ORDINALITY AS k(key,n)
  WHERE jsonb_typeof(u.attributes->k.key)='number' ORDER BY k.n LIMIT 1) AS size
 FROM usable u JOIN g ON g.category=u.category_slug
), members AS (
 SELECT * FROM sized s WHERE ((NOT s.by_weight AND s.size>=s.min_size) OR s.by_weight)
 AND NOT EXISTS (SELECT 1 FROM unnest(s.include) AS i(pattern) WHERE NOT s.name ~* i.pattern)
 AND (s.exclude='' OR NOT s.name ~* s.exclude)
 AND (s.fat_min IS NULL OR (jsonb_typeof(s.attributes->'fatPercent')='number'
  AND (s.attributes->>'fatPercent')::numeric BETWEEN s.fat_min AND s.fat_max))
)`

const szptGroupsSQL = szptMembersSQL + `
SELECT group_slug,count(*),
 coalesce(array_agg(DISTINCT size::float8 ORDER BY size::float8) FILTER (WHERE NOT by_weight),'{}')
FROM members GROUP BY group_slug`

const szptSizesSQL = szptMembersSQL + `
SELECT coalesce(array_agg(DISTINCT size::float8),'{}') FROM members WHERE group_slug=$3 AND NOT by_weight`

// $7 (unit factor) is always referenced so PostgreSQL can type it for both sorts.
// A size filter selects packaged goods only: by_weight goods have no package size.
const szptProductsSQL = szptMembersSQL + `
SELECT id,name,brand,category_slug,category_name,"imageUrl",attributes,min_price,snapshot_at,by_weight,size::float8,unit_exact
FROM (SELECT *,CASE WHEN by_weight THEN unit_weight_exact ELSE min_price::numeric*$7::numeric/size END AS unit_exact
 FROM members WHERE group_slug=$3 AND (cardinality($4::numeric[])=0 OR (NOT by_weight AND size=ANY($4::numeric[])))) page `

// Price basis of a page's offers, matched to attachOffers rows by (product, store); same offer filter.
const szptOfferBasisSQL = `SELECT o."canonicalProductId",s.code,coalesce(b."soldByWeight",false),b."basisGrams"::float8
FROM public.offers o JOIN public.stores s ON s.id=o."storeId"
LEFT JOIN public.offer_price_basis b ON b."offerId"=o.id AND b."snapshotId"=$1
WHERE o."snapshotId"=$1 AND o."canonicalProductId"=ANY($2::text[]) AND o."inStock" AND o.price>0`

func szptOrder(s szpt.Sort) (string, error) {
	switch s {
	case szpt.PriceAsc:
		// Packaged goods by shelf price, then weighted goods by exact per-kg price (by_weight is false outside weighted groups).
		return `ORDER BY by_weight ASC,CASE WHEN by_weight THEN unit_exact ELSE min_price END ASC,min_price ASC,id COLLATE "ru-x-icu" ASC`, nil
	case szpt.UnitPriceAsc:
		return `ORDER BY unit_exact ASC,min_price ASC,id COLLATE "ru-x-icu" ASC`, nil
	default:
		return "", catalog.ErrInvalidQuery
	}
}

func szptRules() (string, error) {
	raw, err := json.Marshal(szpt.Groups)
	return string(raw), err
}

// ListGroups returns non-empty groups of the current snapshot in szpt.Groups order.
func (r *Repository) ListGroups(ctx context.Context) ([]szpt.Group, error) {
	rules, err := szptRules()
	if err != nil {
		return nil, err
	}
	reader, snapshotID, end, err := r.snapshotReader(ctx)
	if err != nil {
		return nil, err
	}
	defer end()
	rows, err := reader.db.Query(ctx, szptGroupsSQL, rules, snapshotID)
	if err != nil {
		return nil, databaseError(err)
	}
	defer rows.Close()
	found := make(map[string]szpt.Group)
	for rows.Next() {
		var g szpt.Group
		if err := rows.Scan(&g.Slug, &g.Count, &g.Sizes); err != nil {
			return nil, databaseError(err)
		}
		found[g.Slug] = g
	}
	if rows.Err() != nil {
		return nil, databaseError(rows.Err())
	}
	out := make([]szpt.Group, 0, len(found))
	for _, rule := range szpt.Groups {
		if g, ok := found[rule.Slug]; ok {
			g.Name, g.Unit, g.DefaultSort = rule.Name, rule.Unit, rule.DefaultSort()
			if g.Sizes == nil {
				g.Sizes = []float64{}
			}
			out = append(out, g)
		}
	}
	return out, nil
}

// ListSzptProducts pages one group; sizes must be listed among the group's current sizes.
func (r *Repository) ListSzptProducts(ctx context.Context, q szpt.Query) ([]szpt.Product, error) {
	rule, ok := szpt.Lookup(q.Group)
	if !ok {
		return nil, catalog.ErrNotFound
	}
	if q.Sort == "" {
		q.Sort = rule.DefaultSort()
	}
	order, err := szptOrder(q.Sort)
	if err != nil {
		return nil, err
	}
	if q.Limit == 0 {
		q.Limit = 24
	}
	if q.Limit < 1 || q.Limit > 100 || q.Offset < 0 || q.Offset > 9007199254740991 {
		return nil, catalog.ErrInvalidQuery
	}
	rules, err := szptRules()
	if err != nil {
		return nil, err
	}
	reader, snapshotID, end, err := r.snapshotReader(ctx)
	if err != nil {
		return nil, err
	}
	defer end()
	sizes := q.Sizes
	if sizes == nil {
		sizes = []float64{}
	}
	if len(sizes) > 0 {
		var allowed []float64
		if err := reader.db.QueryRow(ctx, szptSizesSQL, rules, snapshotID, rule.Slug).Scan(&allowed); err != nil {
			return nil, databaseError(err)
		}
		for _, s := range sizes {
			if !containsFloat(allowed, s) {
				return nil, catalog.ErrInvalidQuery
			}
		}
	}
	rows, err := reader.db.Query(ctx, szptProductsSQL+order+` LIMIT $5 OFFSET $6`,
		rules, snapshotID, rule.Slug, sizes, q.Limit, q.Offset, rule.Unit.Factor())
	if err != nil {
		return nil, databaseError(err)
	}
	type pageRow struct {
		byWeight bool
		size     *float64 // NULL only for by_weight goods
		exact    float64
	}
	cards := make([]catalog.Product, 0)
	page := make([]pageRow, 0)
	for rows.Next() {
		var p catalog.Product
		var attributes []byte
		var row pageRow
		if err := rows.Scan(&p.ID, &p.Name, &p.Brand, &p.Category.Slug, &p.Category.Name, &p.ImageURL, &attributes, &p.MinPrice, &p.SnapshotAt, &row.byWeight, &row.size, &row.exact); err != nil {
			rows.Close()
			return nil, databaseError(err)
		}
		p.Attributes = scalarAttributes(attributes)
		p.SnapshotAt = p.SnapshotAt.UTC()
		cards = append(cards, p)
		page = append(page, row)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, databaseError(err)
	}
	if err := reader.attachOffers(ctx, cards, snapshotID); err != nil {
		return nil, err
	}
	// Offers of non-weighted groups are not looked up in the view: priced by package size, as in phase 1.
	var basis map[offerKey]float64
	if rule.Weighted && len(cards) > 0 {
		if basis, err = reader.szptOfferBasis(ctx, snapshotID, cards); err != nil {
			return nil, err
		}
	}
	out := make([]szpt.Product, 0, len(cards))
	for i, card := range cards {
		row := page[i]
		var unit szpt.UnitPrice
		if row.byWeight {
			unit = szpt.RoundUnit(row.exact, rule.Unit)
		} else {
			unit = szpt.PriceOf(card.MinPrice, *row.size, rule.Unit)
		}
		p := szpt.Product{Product: card, UnitPrice: &unit, SoldByWeight: row.byWeight, Offers: make([]szpt.Offer, 0, len(card.Offers))}
		for _, o := range card.Offers {
			offer := szpt.Offer{Offer: o}
			// Each offer is priced by its own basis (a mixed product keeps its package size for piece offers).
			if grams, ok := basis[offerKey{card.ID, o.StoreCode}]; ok {
				price := szpt.PriceOfWeighted(o.Price, grams)
				offer.UnitPrice, offer.SoldByWeight = &price, true
			} else if row.size != nil {
				price := szpt.PriceOf(o.Price, *row.size, rule.Unit)
				offer.UnitPrice = &price
			}
			p.Offers = append(p.Offers, offer)
		}
		out = append(out, p)
	}
	return out, nil
}

type offerKey struct {
	product string
	store   catalog.StoreCode
}

// szptOfferBasis maps each weighted offer of the page to its basis grams; piece offers are absent.
func (r *Repository) szptOfferBasis(ctx context.Context, snapshotID string, cards []catalog.Product) (map[offerKey]float64, error) {
	ids := make([]string, 0, len(cards))
	for _, c := range cards {
		ids = append(ids, c.ID)
	}
	rows, err := r.db.Query(ctx, szptOfferBasisSQL, snapshotID, ids)
	if err != nil {
		return nil, databaseError(err)
	}
	defer rows.Close()
	out := make(map[offerKey]float64)
	for rows.Next() {
		var key offerKey
		var weighted bool
		var grams *float64
		if err := rows.Scan(&key.product, &key.store, &weighted, &grams); err != nil {
			return nil, databaseError(err)
		}
		if weighted && grams != nil {
			out[key] = *grams
		}
	}
	if rows.Err() != nil {
		return nil, databaseError(rows.Err())
	}
	return out, nil
}

func containsFloat(values []float64, v float64) bool {
	for _, x := range values {
		if x == v {
			return true
		}
	}
	return false
}

// SzptRepository adapts Repository to szpt.Repository (ListProducts is taken by the catalog).
type SzptRepository struct{ *Repository }

func (r SzptRepository) ListProducts(ctx context.Context, q szpt.Query) ([]szpt.Product, error) {
	return r.ListSzptProducts(ctx, q)
}

var _ szpt.Repository = SzptRepository{}
