//go:build integration

package integration

import (
	"context"
	"errors"
	"reflect"
	"sort"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/postgres"
	"adilbaga/backend-go/internal/szpt"
)

func szptIDs(products []szpt.Product) []string {
	out := make([]string, 0, len(products))
	for _, p := range products {
		out = append(out, p.ID)
	}
	return out
}

// TestDeterministicSzpt pins the plan's Task 3 table: real catalog names and the group each must land in.
func TestDeterministicSzpt(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	admin, apiURL := openPart04Fixture(t, ctx, "szpt.sql")
	pool, err := postgres.OpenReadOnly(ctx, apiURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := postgres.NewRepository(pool)
	list := func(t *testing.T, q szpt.Query) []szpt.Product {
		t.Helper()
		if q.Limit == 0 {
			q.Limit = 100
		}
		products, err := repo.ListSzptProducts(ctx, q)
		if err != nil {
			t.Fatalf("%+v: %v", q, err)
		}
		return products
	}

	t.Run("membership", func(t *testing.T) {
		want := map[string][]string{
			"rice":           {"r1", "r2", "r3", "r4", "r5", "r6"},
			"buckwheat":      {"b1"},
			"sour-cream":     {"s1"},
			"cottage-cheese": {"c1", "c2", "c6"},
			"cheese":         {"h1", "h10", "h11", "h12", "h14", "h2", "h3"},
			"milk":           {"m1", "m2"},
			"kefir":          {"k1"},
			"sunflower-oil":  {"o1"},
			"eggs":           {"e1", "e2", "e3"},
			"butter":         {"u1", "u2"},
		}
		for slug, ids := range want {
			got := szptIDs(list(t, szpt.Query{Group: slug}))
			sort.Strings(got)
			if !reflect.DeepEqual(got, ids) {
				t.Errorf("%s = %v, want %v", slug, got, ids)
			}
		}
	})

	t.Run("price_basis", func(t *testing.T) {
		type basis struct {
			weighted bool
			grams    *float64
		}
		g := func(v float64) *float64 { return &v }
		want := map[string]basis{
			"w-pot1": {true, g(1000)}, "w-pot2": {true, g(1000)}, "w-cuc1": {true, g(1000)}, "w-cuc2": {true, g(1000)},
			"w-chk1": {true, g(1800)}, "w-beef1": {true, g(1000)}, "w-mince-w": {true, g(1000)}, "w-pot-out": {true, g(1000)},
			"h14":        {true, g(300)},
			"w-mince-p1": {}, "w-mince-p2": {}, "w-mince-p3": {}, "w-mince-x": {}, "w-sug-fix": {},
			"r1": {}, "e1": {}, "u1": {}, "h5": {},
		}
		rows, err := pool.Query(ctx, `SELECT o."canonicalProductId",b."soldByWeight",b."basisGrams"::float8 FROM offer_price_basis b JOIN offers o ON o.id=b."offerId"`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		got := map[string]basis{}
		for rows.Next() {
			var id string
			var b basis
			if err := rows.Scan(&id, &b.weighted, &b.grams); err != nil {
				t.Fatal(err)
			}
			got[id] = b
			if b.weighted != (b.grams != nil) {
				t.Errorf("%s: soldByWeight=%v but basisGrams=%v", id, b.weighted, b.grams)
			}
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		for id, w := range want {
			if !reflect.DeepEqual(got[id], w) {
				t.Errorf("%s = %+v, want %+v", id, got[id], w)
			}
		}
		var views, offers int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM offer_price_basis`).Scan(&views); err != nil {
			t.Fatal(err)
		}
		if err := admin.QueryRow(ctx, `SELECT count(*) FROM offers`).Scan(&offers); err != nil {
			t.Fatal(err)
		}
		if views != offers {
			t.Errorf("view rows = %d, offers = %d", views, offers)
		}
		if _, err := pool.Exec(ctx, `SELECT 1 FROM raw_products LIMIT 1`); err == nil {
			t.Error("aktau_api_reader must not read raw_products")
		}
	})

	t.Run("groups", func(t *testing.T) {
		groups, err := repo.ListGroups(ctx)
		if err != nil {
			t.Fatal(err)
		}
		slugs := make([]string, 0, len(groups))
		bySlug := map[string]szpt.Group{}
		for _, g := range groups {
			slugs = append(slugs, g.Slug)
			bySlug[g.Slug] = g
		}
		order := make([]string, 0, len(szpt.Groups))
		for _, g := range szpt.Groups {
			order = append(order, g.Slug)
		}
		if !reflect.DeepEqual(slugs, order) {
			t.Fatalf("groups = %v, want %v", slugs, order)
		}
		rice := bySlug["rice"]
		if rice.Count != 6 || !reflect.DeepEqual(rice.Sizes, []float64{500, 800, 900, 1000}) || rice.Unit != szpt.Kg || rice.Name != "Рис" {
			t.Errorf("rice = %+v", rice)
		}
		if !reflect.DeepEqual(bySlug["milk"].Sizes, []float64{900, 1000}) || bySlug["milk"].Unit != szpt.L {
			t.Errorf("milk = %+v", bySlug["milk"])
		}
		if !reflect.DeepEqual(bySlug["eggs"].Sizes, []float64{1, 10, 30}) || bySlug["eggs"].Unit != szpt.Pcs10 {
			t.Errorf("eggs = %+v", bySlug["eggs"])
		}
	})

	t.Run("team example", func(t *testing.T) {
		q := szpt.Query{Group: "rice", Sizes: []float64{500, 1000}}
		if got := szptIDs(list(t, q)); !reflect.DeepEqual(got, []string{"r3", "r6", "r4"}) {
			t.Errorf("price_asc = %v", got)
		}
		q.Sort = szpt.UnitPriceAsc
		products := list(t, q)
		if got := szptIDs(products); !reflect.DeepEqual(got, []string{"r6", "r4", "r3"}) {
			t.Errorf("unit_price_asc = %v", got)
		}
		for _, p := range products {
			want := map[string]szpt.UnitPrice{"r3": {Value: 840, Unit: szpt.Kg}, "r4": {Value: 710, Unit: szpt.Kg}, "r6": {Value: 500, Unit: szpt.Kg}}[p.ID]
			if p.UnitPrice == nil || *p.UnitPrice != want {
				t.Errorf("%s unitPrice = %+v, want %+v", p.ID, p.UnitPrice, want)
			}
		}
	})

	t.Run("equal unit price", func(t *testing.T) {
		got := szptIDs(list(t, szpt.Query{Group: "rice", Sizes: []float64{800, 1000}, Sort: szpt.UnitPriceAsc}))
		if !reflect.DeepEqual(got, []string{"r5", "r6", "r4", "r1"}) {
			t.Errorf("unit_price_asc = %v, want r5 (400 ₸) before r6 (500 ₸) at 500 ₸/kg", got)
		}
	})

	t.Run("offer unit prices", func(t *testing.T) {
		products := list(t, szpt.Query{Group: "rice", Sizes: []float64{800}})
		var r1 *szpt.Product
		for i := range products {
			if products[i].ID == "r1" {
				r1 = &products[i]
			}
		}
		if r1 == nil || r1.UnitPrice == nil || *r1.UnitPrice != (szpt.UnitPrice{Value: 750, Unit: szpt.Kg}) || r1.MinPrice != 600 {
			t.Fatalf("r1 = %+v", r1)
		}
		type row struct {
			store catalog.StoreCode
			price int
			unit  float64
		}
		got := []row{}
		for _, o := range r1.Offers {
			got = append(got, row{o.StoreCode, o.Price, o.UnitPrice.Value})
		}
		if !reflect.DeepEqual(got, []row{{catalog.DINA, 600, 750}, {catalog.DANA, 640, 800}}) {
			t.Errorf("r1 offers = %+v", got)
		}
	})

	t.Run("units", func(t *testing.T) {
		cases := map[string]struct {
			group string
			want  szpt.UnitPrice
		}{
			"m2": {"milk", szpt.UnitPrice{Value: 531.11, Unit: szpt.L}},
			"e1": {"eggs", szpt.UnitPrice{Value: 690, Unit: szpt.Pcs10}},
			"h3": {"cheese", szpt.UnitPrice{Value: 7600, Unit: szpt.Kg}},
		}
		for id, c := range cases {
			found := false
			for _, p := range list(t, szpt.Query{Group: c.group}) {
				if p.ID == id {
					found = true
					if p.UnitPrice == nil || *p.UnitPrice != c.want {
						t.Errorf("%s unitPrice = %+v, want %+v", id, p.UnitPrice, c.want)
					}
				}
			}
			if !found {
				t.Errorf("%s missing from %s", id, c.group)
			}
		}
	})

	t.Run("pagination", func(t *testing.T) {
		for _, s := range []szpt.Sort{szpt.PriceAsc, szpt.UnitPriceAsc} {
			full := szptIDs(list(t, szpt.Query{Group: "rice", Sort: s}))
			paged := []string{}
			for offset := int64(0); offset < 6; offset += 2 {
				paged = append(paged, szptIDs(list(t, szpt.Query{Group: "rice", Sort: s, Limit: 2, Offset: offset}))...)
			}
			if !reflect.DeepEqual(paged, full) || len(full) != 6 {
				t.Errorf("%s: paged %v, full %v", s, paged, full)
			}
		}
	})

	t.Run("errors", func(t *testing.T) {
		cases := []struct {
			q    szpt.Query
			want error
		}{
			{szpt.Query{Group: "nope", Limit: 24}, catalog.ErrNotFound},
			{szpt.Query{Group: "rice", Sizes: []float64{700}, Limit: 24}, catalog.ErrInvalidQuery},
			{szpt.Query{Group: "rice", Limit: 101}, catalog.ErrInvalidQuery},
			{szpt.Query{Group: "rice", Limit: 24, Sort: "price_desc"}, catalog.ErrInvalidQuery},
		}
		for _, c := range cases {
			if _, err := repo.ListSzptProducts(ctx, c.q); !errors.Is(err, c.want) {
				t.Errorf("%+v: err = %v, want %v", c.q, err, c.want)
			}
		}
	})

	// Last: the deletion is not restored.
	t.Run("empty group omitted", func(t *testing.T) {
		if _, err := admin.Exec(ctx, `DELETE FROM offers WHERE "canonicalProductId"='o1'`); err != nil {
			t.Fatal(err)
		}
		groups, err := repo.ListGroups(ctx)
		if err != nil {
			t.Fatal(err)
		}
		for _, g := range groups {
			if g.Slug == "sunflower-oil" {
				t.Fatal("empty group must be omitted")
			}
		}
		if len(groups) != len(szpt.Groups)-1 {
			t.Errorf("groups = %d, want %d", len(groups), len(szpt.Groups)-1)
		}
	})
}
