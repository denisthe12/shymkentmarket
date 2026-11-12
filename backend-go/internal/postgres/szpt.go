package postgres

import (
	"context"
	"encoding/json"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/szpt"
)

// Group rules arrive as one JSON parameter ($1, szpt.Groups); patterns are data, never SQL text.
// size is the first numeric attribute among size_keys (milk/kefir: volumeMl, else weightGrams).
const szptMembersSQL = `WITH g AS (
 SELECT * FROM jsonb_to_recordset($1::jsonb) AS g(slug text,category text,size_keys text[],min_size numeric,
  include text[],exclude text,fat_min numeric,fat_max numeric)
), usable AS (
 SELECT p.id,p.name,p.brand,c.slug AS category_slug,c.name AS category_name,p."imageUrl",p.attributes,
 MIN(o.price) AS min_price,MAX(o."snapshotAt" AT TIME ZONE 'UTC') AS snapshot_at
 FROM public.canonical_products p JOIN public.categories c ON c.id=p."categoryId"
 JOIN public.offers o ON o."canonicalProductId"=p.id AND o."inStock" AND o.price>0
 WHERE o."snapshotId"=$2
 GROUP BY p.id,c.slug,c.name
), sized AS (
 SELECT u.*,g.slug AS group_slug,g.min_size,g.include,g.exclude,g.fat_min,g.fat_max,
 (SELECT (u.attributes->>k.key)::numeric FROM unnest(g.size_keys) WITH ORDINALITY AS k(key,n)
  WHERE jsonb_typeof(u.attributes->k.key)='number' ORDER BY k.n LIMIT 1) AS size
 FROM usable u JOIN g ON g.category=u.category_slug
), members AS (
 SELECT * FROM sized s WHERE s.size>=s.min_size
 AND NOT EXISTS (SELECT 1 FROM unnest(s.include) AS i(pattern) WHERE NOT s.name ~* i.pattern)
 AND (s.exclude='' OR NOT s.name ~* s.exclude)
 AND (s.fat_min IS NULL OR (jsonb_typeof(s.attributes->'fatPercent')='number'
  AND (s.attributes->>'fatPercent')::numeric BETWEEN s.fat_min AND s.fat_max))
)`

const szptGroupsSQL = szptMembersSQL + `
SELECT group_slug,count(*),array_agg(DISTINCT size::float8 ORDER BY size::float8) FROM members GROUP BY group_slug`

const szptSizesSQL = szptMembersSQL + `
SELECT coalesce(array_agg(DISTINCT size::float8),'{}') FROM members WHERE group_slug=$3`

// $7 (unit factor) is always referenced so PostgreSQL can type it for both sorts.
const szptProductsSQL = szptMembersSQL + `
SELECT id,name,brand,category_slug,category_name,"imageUrl",attributes,min_price,snapshot_at,size::float8,
 min_price::numeric*$7::numeric/size AS unit_exact
FROM members WHERE group_slug=$3 AND (cardinality($4::numeric[])=0 OR size=ANY($4::numeric[])) `

func szptOrder(s szpt.Sort) (string, error) {
	switch s {
	case szpt.PriceAsc:
		return `ORDER BY min_price ASC,id COLLATE "ru-x-icu" ASC`, nil
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
			g.Name, g.Unit = rule.Name, rule.Unit
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
		q.Sort = szpt.PriceAsc
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
	cards := make([]catalog.Product, 0)
	packSizes := make([]float64, 0)
	for rows.Next() {
		var p catalog.Product
		var attributes []byte
		var size, exact float64
		if err := rows.Scan(&p.ID, &p.Name, &p.Brand, &p.Category.Slug, &p.Category.Name, &p.ImageURL, &attributes, &p.MinPrice, &p.SnapshotAt, &size, &exact); err != nil {
			rows.Close()
			return nil, databaseError(err)
		}
		p.Attributes = scalarAttributes(attributes)
		p.SnapshotAt = p.SnapshotAt.UTC()
		cards = append(cards, p)
		packSizes = append(packSizes, size)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, databaseError(err)
	}
	if err := reader.attachOffers(ctx, cards, snapshotID); err != nil {
		return nil, err
	}
	out := make([]szpt.Product, 0, len(cards))
	for i, card := range cards {
		unit := szpt.PriceOf(card.MinPrice, packSizes[i], rule.Unit)
		p := szpt.Product{Product: card, UnitPrice: &unit, Offers: make([]szpt.Offer, 0, len(card.Offers))}
		for _, o := range card.Offers {
			price := szpt.PriceOf(o.Price, packSizes[i], rule.Unit)
			p.Offers = append(p.Offers, szpt.Offer{Offer: o, UnitPrice: &price})
		}
		out = append(out, p)
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
