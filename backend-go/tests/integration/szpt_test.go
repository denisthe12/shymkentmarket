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

	// Real catalog names of the 15 new groups: every "in" row is a member of its group, every "out" row is not.
	// Rows are n-<group>-in|out<N> in fixtures/szpt.sql.
	t.Run("new_groups_membership", func(t *testing.T) {
		cases := []struct {
			id    string
			group string
			in    bool
		}{
			{"n-flour-in1", "flour", true},
			{"n-flour-in2", "flour", true},
			{"n-flour-in3", "flour", true},
			{"n-flour-in4", "flour", true},
			{"n-flour-out5", "flour", false},
			{"n-flour-out6", "flour", false},
			{"n-flour-out7", "flour", false},
			{"n-flour-out8", "flour", false},
			{"n-flour-out9", "flour", false},
			{"n-bread-in10", "bread", true},
			{"n-bread-in11", "bread", true},
			{"n-bread-in12", "bread", true},
			{"n-bread-in13", "bread", true},
			{"n-bread-out14", "bread", false},
			{"n-bread-out15", "bread", false},
			{"n-bread-out16", "bread", false},
			{"n-bread-out17", "bread", false},
			{"n-bread-out18", "bread", false},
			{"n-pasta-horns-in19", "pasta-horns", true},
			{"n-pasta-horns-in20", "pasta-horns", true},
			{"n-pasta-horns-in21", "pasta-horns", true},
			{"n-pasta-horns-out22", "pasta-horns", false},
			{"n-pasta-horns-out23", "pasta-horns", false},
			{"n-sugar-in24", "sugar", true},
			{"n-sugar-in25", "sugar", true},
			{"n-sugar-in26", "sugar", true},
			{"n-sugar-in27", "sugar", true},
			{"n-sugar-out28", "sugar", false},
			{"n-sugar-out29", "sugar", false},
			{"n-sugar-out30", "sugar", false},
			{"n-sugar-out31", "sugar", false},
			{"n-sugar-out32", "sugar", false},
			{"n-carrots-in33", "carrots", true},
			{"n-carrots-out34", "carrots", false},
			{"n-carrots-in71", "carrots", true},
			{"n-onions-in35", "onions", true},
			{"n-onions-out36", "onions", false},
			{"n-cabbage-in37", "cabbage", true},
			{"n-cabbage-out38", "cabbage", false},
			{"n-cabbage-out67", "cabbage", false},
			{"n-cabbage-out69", "cabbage", false},
			{"n-tomatoes-in39", "tomatoes", true},
			{"n-tomatoes-out40", "tomatoes", false},
			{"n-apples-in41", "apples", true},
			{"n-apples-out42", "apples", false},
			{"n-cucumbers-out43", "cucumbers", false},
			{"n-cucumbers-out44", "cucumbers", false},
			{"n-beef-in45", "beef", true},
			{"n-beef-in46", "beef", true},
			{"n-beef-out47", "beef", false},
			{"n-beef-out48", "beef", false},
			{"n-beef-out49", "beef", false},
			{"n-beef-out50", "beef", false},
			{"n-beef-out51", "beef", false},
			{"n-beef-out70", "beef", false},
			{"n-minced-meat-out52", "minced-meat", false},
			{"n-minced-meat-out53", "minced-meat", false},
			{"n-chicken-parts-in54", "chicken-parts", true},
			{"n-chicken-parts-in55", "chicken-parts", true},
			{"n-chicken-parts-in56", "chicken-parts", true},
			{"n-chicken-parts-in57", "chicken-parts", true},
			{"n-chicken-parts-out58", "chicken-parts", false},
			{"n-chicken-parts-out59", "chicken-parts", false},
			{"n-chicken-parts-out60", "chicken-parts", false},
			{"n-chicken-parts-out61", "chicken-parts", false},
			{"n-chicken-in62", "chicken", true},
			{"n-chicken-in63", "chicken", true},
			{"n-chicken-in64", "chicken", true},
			{"n-chicken-out65", "chicken", false},
			{"n-chicken-out66", "chicken", false},
			{"n-chicken-out67", "chicken", false},
			{"n-chicken-out68", "chicken", false},
		}
		members := map[string]map[string]bool{}
		for _, c := range cases {
			if members[c.group] == nil {
				members[c.group] = map[string]bool{}
				for _, id := range szptIDs(list(t, szpt.Query{Group: c.group})) {
					members[c.group][id] = true
				}
			}
			if got := members[c.group][c.id]; got != c.in {
				t.Errorf("%s in %s = %v, want %v", c.id, c.group, got, c.in)
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
		var columns []string
		if err := pool.QueryRow(ctx, `SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='offer_price_basis'`).Scan(&columns); err != nil {
			t.Fatal(err)
		}
		if want := []string{"offerId", "soldByWeight", "basisGrams", "snapshotId"}; !reflect.DeepEqual(columns, want) {
			t.Errorf("offer_price_basis columns = %v, want %v", columns, want)
		}
		rows, err := pool.Query(ctx, `SELECT o."canonicalProductId",b."soldByWeight",b."basisGrams"::float8,b."snapshotId",o."snapshotId"
 FROM offer_price_basis b JOIN offers o ON o.id=b."offerId"`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		got := map[string]basis{}
		for rows.Next() {
			var id, viewSnapshot, offerSnapshot string
			var b basis
			if err := rows.Scan(&id, &b.weighted, &b.grams, &viewSnapshot, &offerSnapshot); err != nil {
				t.Fatal(err)
			}
			if viewSnapshot != offerSnapshot {
				t.Errorf("%s: view snapshotId %q, offer snapshotId %q", id, viewSnapshot, offerSnapshot)
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
		// Every group has fixture members, so the full szpt.Groups order must come back.
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

	find := func(t *testing.T, products []szpt.Product, id string) *szpt.Product {
		t.Helper()
		for i := range products {
			if products[i].ID == id {
				return &products[i]
			}
		}
		t.Fatalf("%s missing from %v", id, szptIDs(products))
		return nil
	}
	kg := func(v float64) szpt.UnitPrice { return szpt.UnitPrice{Value: v, Unit: szpt.Kg} }

	t.Run("weighted_membership", func(t *testing.T) {
		equal := map[string][]string{
			"potatoes":    {"w-pot1", "w-pot2"},
			"cucumbers":   {"w-cuc1", "w-cuc2"},
			"minced-meat": {"w-mince-p1", "w-mince-p2", "w-mince-p3", "w-mince-w"},
		}
		for slug, ids := range equal {
			got := szptIDs(list(t, szpt.Query{Group: slug}))
			sort.Strings(got)
			if !reflect.DeepEqual(got, ids) {
				t.Errorf("%s = %v, want %v", slug, got, ids)
			}
		}
		find(t, list(t, szpt.Query{Group: "chicken"}), "w-chk1")
		find(t, list(t, szpt.Query{Group: "beef"}), "w-beef1")
		h14 := find(t, list(t, szpt.Query{Group: "cheese"}), "h14")
		if h14.SoldByWeight || h14.UnitPrice == nil || *h14.UnitPrice != kg(3000) {
			t.Errorf("h14 = soldByWeight %v, unitPrice %+v; want false, 3000 kg (phase 1, by package)", h14.SoldByWeight, h14.UnitPrice)
		}
		for _, o := range h14.Offers {
			if o.SoldByWeight {
				t.Errorf("h14 offer %s soldByWeight in a non-weighted group", o.StoreCode)
			}
		}
	})

	t.Run("weighted_prices", func(t *testing.T) {
		chk := find(t, list(t, szpt.Query{Group: "chicken"}), "w-chk1")
		if !chk.SoldByWeight || chk.UnitPrice == nil || *chk.UnitPrice != kg(822.22) || chk.MinPrice != 1480 {
			t.Errorf("w-chk1 = soldByWeight %v, unitPrice %+v, minPrice %d", chk.SoldByWeight, chk.UnitPrice, chk.MinPrice)
		}
		if len(chk.Offers) != 1 || !chk.Offers[0].SoldByWeight || chk.Offers[0].UnitPrice == nil || *chk.Offers[0].UnitPrice != kg(822.22) {
			t.Errorf("w-chk1 offers = %+v", chk.Offers)
		}
		cuc := find(t, list(t, szpt.Query{Group: "cucumbers"}), "w-cuc1")
		if !cuc.SoldByWeight || cuc.UnitPrice == nil || *cuc.UnitPrice != kg(539) || cuc.MinPrice != 539 {
			t.Errorf("w-cuc1 = soldByWeight %v, unitPrice %+v, minPrice %d", cuc.SoldByWeight, cuc.UnitPrice, cuc.MinPrice)
		}
		p1 := find(t, list(t, szpt.Query{Group: "minced-meat"}), "w-mince-p1")
		if p1.SoldByWeight || p1.UnitPrice == nil || *p1.UnitPrice != kg(2440) || len(p1.Offers) != 1 || p1.Offers[0].SoldByWeight || *p1.Offers[0].UnitPrice != kg(2440) {
			t.Errorf("w-mince-p1 = %+v", p1)
		}
	})

	t.Run("weighted_sorts", func(t *testing.T) {
		unit := []string{"w-mince-p1", "w-mince-p2", "w-mince-w", "w-mince-p3"}
		price := []string{"w-mince-p1", "w-mince-p2", "w-mince-p3", "w-mince-w"}
		cases := []struct {
			sort szpt.Sort
			want []string
		}{{"", unit}, {szpt.UnitPriceAsc, unit}, {szpt.PriceAsc, price}}
		for _, c := range cases {
			products := list(t, szpt.Query{Group: "minced-meat", Sort: c.sort})
			if got := szptIDs(products); !reflect.DeepEqual(got, c.want) {
				t.Errorf("sort %q = %v, want %v", c.sort, got, c.want)
			}
			paged := []string{}
			for offset := int64(0); offset < 4; offset++ {
				paged = append(paged, szptIDs(list(t, szpt.Query{Group: "minced-meat", Sort: c.sort, Limit: 1, Offset: offset}))...)
			}
			if !reflect.DeepEqual(paged, c.want) {
				t.Errorf("sort %q paged = %v, want %v", c.sort, paged, c.want)
			}
		}
		want := map[string]szpt.UnitPrice{"w-mince-p1": kg(2440), "w-mince-p2": kg(3928), "w-mince-w": kg(4420), "w-mince-p3": kg(4600)}
		for _, p := range list(t, szpt.Query{Group: "minced-meat"}) {
			if p.UnitPrice == nil || *p.UnitPrice != want[p.ID] || p.SoldByWeight != (p.ID == "w-mince-w") {
				t.Errorf("%s = unitPrice %+v, soldByWeight %v", p.ID, p.UnitPrice, p.SoldByWeight)
			}
		}
	})

	t.Run("weighted_groups", func(t *testing.T) {
		groups, err := repo.ListGroups(ctx)
		if err != nil {
			t.Fatal(err)
		}
		bySlug := map[string]szpt.Group{}
		for _, g := range groups {
			bySlug[g.Slug] = g
			rule, _ := szpt.Lookup(g.Slug)
			if g.DefaultSort != rule.DefaultSort() || g.Sizes == nil {
				t.Errorf("%s: defaultSort %q, sizes %#v", g.Slug, g.DefaultSort, g.Sizes)
			}
		}
		pot := bySlug["potatoes"]
		if pot.DefaultSort != szpt.UnitPriceAsc || !reflect.DeepEqual(pot.Sizes, []float64{}) || pot.Count != 2 || pot.Unit != szpt.Kg {
			t.Errorf("potatoes = %+v", pot)
		}
		mince := bySlug["minced-meat"]
		if !reflect.DeepEqual(mince.Sizes, []float64{450, 500, 1000}) || mince.Count != 4 || mince.DefaultSort != szpt.UnitPriceAsc {
			t.Errorf("minced-meat = %+v", mince)
		}
		if bySlug["rice"].DefaultSort != szpt.PriceAsc {
			t.Errorf("rice = %+v", bySlug["rice"])
		}
		if bySlug["cheese"].Count != 7 {
			t.Errorf("cheese count = %d, want 7 (with h14)", bySlug["cheese"].Count)
		}
	})

	t.Run("weighted_sizes", func(t *testing.T) {
		if got := szptIDs(list(t, szpt.Query{Group: "minced-meat", Sizes: []float64{450}})); !reflect.DeepEqual(got, []string{"w-mince-p1"}) {
			t.Errorf("minced-meat size 450 = %v", got)
		}
		_, err := repo.ListSzptProducts(ctx, szpt.Query{Group: "potatoes", Sizes: []float64{1000}, Limit: 24})
		if !errors.Is(err, catalog.ErrInvalidQuery) {
			t.Errorf("potatoes size 1000: err = %v", err)
		}
	})

	// Last: the deletion is not restored.
	t.Run("empty group omitted", func(t *testing.T) {
		before, err := repo.ListGroups(ctx)
		if err != nil {
			t.Fatal(err)
		}
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
		if len(groups) != len(before)-1 {
			t.Errorf("groups = %d, want %d", len(groups), len(before)-1)
		}
	})
}
