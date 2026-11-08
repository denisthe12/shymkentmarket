//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"reflect"
	"sort"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/postgres"
)

func TestProductionClone(t *testing.T) {
	target := os.Getenv("SMOKE_DATABASE_URL")
	if target == "" {
		t.Skip("explicit local clone URL required")
	}
	if !localURL(target) {
		t.Fatal("clone smoke must target loopback")
	}
	u, _ := url.Parse(target)
	if u.User.Username() != "part04_api_login" {
		t.Fatal("clone repository must use restricted login")
	}
	smoke(t, target)
}
func TestLiveReadOnlySmoke(t *testing.T) {
	target := os.Getenv("LIVE_DATABASE_URL")
	if target == "" {
		t.Skip("explicit live read-only profile required")
	}
	if os.Getenv("LIVE_READONLY_CONFIRM") != "1" {
		t.Fatal("explicit LIVE_READONLY_CONFIRM=1 required")
	}
	smoke(t, target)
}
func smoke(t *testing.T, target string) {
	t.Helper()
	// No shared workflow deadline: each DB/HTTP operation has its own budget.
	ctx := t.Context()
	pool, err := postgres.OpenReadOnly(ctx, target)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	db := &countedDB{pool: pool}
	repo := postgres.NewRepository(db)
	runPhase(t, "session_policy", func(t *testing.T) {
		policy, err := boundedCall(t.Context(), func(op context.Context) (string, error) {
			var value string
			err := pool.QueryRow(op, "SHOW default_transaction_read_only").Scan(&value)
			return value, err
		})
		if err != nil || policy != "on" {
			t.Fatal("read-only policy")
		}
	})
	var categories []catalog.Category
	runPhase(t, "categories", func(t *testing.T) {
		ctx := t.Context()
		var err error
		categories, err = boundedCall(ctx, repo.ListCategories)
		if err != nil || len(categories) < 1 {
			t.Fatal("categories smoke")
		}
		for i := 1; i < len(categories); i++ {
			if categories[i-1].Slug > categories[i].Slug {
				t.Fatal("category order")
			}
		}
	})
	observedTotal := 0
	for _, order := range []catalog.Sort{catalog.PriceAsc, catalog.PriceDesc, catalog.NameAsc} {
		runPhase(t, "sort_"+string(order), func(t *testing.T) {
			ctx := t.Context()
			ceiling := pageCeiling(observedTotal)
			seen := map[string]bool{}
			total := 0
			for pageNumber := 0; ; pageNumber++ {
				if pageNumber >= ceiling {
					t.Fatal("pagination safety ceiling exceeded")
				}
				offset := int64(pageNumber * 100)
				db.count = 0
				page, err := boundedCall(ctx, func(op context.Context) ([]catalog.Product, error) {
					return repo.ListProducts(op, catalog.ProductQuery{Sort: order, Limit: 100, Offset: offset})
				})
				if err != nil {
					t.Fatal(err)
				}
				if len(page) > 100 || db.count > 3 {
					t.Fatal("page bound/N+1")
				}
				for _, p := range page {
					if seen[p.ID] {
						t.Fatal("duplicate across pages")
					}
					seen[p.ID] = true
					if p.MinPrice <= 0 || len(p.Offers) == 0 || p.MinPrice != p.Offers[0].Price || p.SnapshotAt.IsZero() || p.SnapshotAt.Location() != time.UTC {
						t.Fatal("product invariants")
					}
					for i, o := range p.Offers {
						if o.Price <= 0 || (i > 0 && p.Offers[i-1].Price > o.Price) {
							t.Fatal("offer invariants")
						}
					}
				}
				if total == 0 && len(page) > 0 {
					detail, err := boundedCall(ctx, func(op context.Context) (catalog.Product, error) { return repo.GetProductByID(op, page[0].ID) })
					if err != nil {
						t.Fatal(err)
					}
					compareProducts(t, []catalog.Product{detail}, page[:1], order, 0)
				}
				total += len(page)
				if len(page) < 100 {
					break
				}
			}
			if total == 0 {
				t.Fatal("no usable products")
			}
			if observedTotal != 0 && total != observedTotal {
				t.Fatal("sort total mismatch")
			}
			observedTotal = total
			t.Logf("sort=%s all products=%d", order, total)
		})
	}
	runPhase(t, "filters", func(t *testing.T) {
		for _, c := range categories {
			runPhase(t, c.Slug, func(t *testing.T) {
				ctx := t.Context()
				schema, err := boundedCall(ctx, func(op context.Context) (catalog.FilterSchema, error) { return repo.GetFilterSchema(op, c.Slug) })
				if err != nil {
					t.Fatal(err)
				}
				var filter *catalog.FilterDefinition
				for i := range schema.Filters {
					if schema.Filters[i].Type == "multi-select" && len(schema.Filters[i].Options) > 0 {
						filter = &schema.Filters[i]
						break
					}
				}
				query := catalog.ProductQuery{Category: c.Slug, Limit: 100}
				if filter != nil {
					query.Filters = catalog.DynamicFilter{filter.Key: []json.RawMessage{filter.Options[0]}}
				}
				products, err := boundedCall(ctx, func(op context.Context) ([]catalog.Product, error) { return repo.ListProducts(op, query) })
				if err != nil {
					t.Fatal(err)
				}
				for _, p := range products {
					if p.Category.Slug != c.Slug {
						t.Fatal("category SQL")
					}
					if filter != nil {
						var raw json.RawMessage
						if filter.Key == "brand" {
							raw, _ = json.Marshal(p.Brand)
						} else {
							raw = p.Attributes[filter.Key]
						}
						if !sameJSONRaw(raw, filter.Options[0]) {
							t.Fatal("actual filter value")
						}
					}
				}
			})
		}
	})
	for _, testCase := range []struct{ name, search string }{
		{"milk", "МОЛОКО"}, {"percent", "%"}, {"underscore", "_"}, {"backslash", `\`}, {"milk_percent", `Молок%`}, {"milk_underscore", `Молок_`}, {"escaped_percent", `\%`}, {"escaped_underscore", `\_`}, {"absent_literal", `literal%_\not-present`}, {"injection_shaped", `' OR true --`},
	} {
		runPhase(t, "search_"+testCase.name, func(t *testing.T) {
			ctx := t.Context()
			search := testCase.search
			seen := map[string]bool{}
			total := 0
			for pageNumber := 0; ; pageNumber++ {
				if pageNumber >= pageCeiling(observedTotal) {
					t.Fatal("pagination safety ceiling exceeded")
				}
				offset := int64(pageNumber * 100)
				products, err := boundedCall(ctx, func(op context.Context) ([]catalog.Product, error) {
					return repo.ListProducts(op, catalog.ProductQuery{Search: search, Limit: 100, Offset: offset})
				})
				if err != nil {
					t.Fatal(err)
				}
				if len(products) > 100 {
					t.Fatal("search page bound")
				}
				for _, p := range products {
					if seen[p.ID] {
						t.Fatal("duplicate across search pages")
					}
					seen[p.ID] = true
				}
				total += len(products)
				if len(products) < 100 {
					break
				}
			}
			t.Logf("search=%q products=%d", search, total)
		})
	}
}
func runPhase(t *testing.T, name string, phase func(*testing.T)) {
	t.Helper()
	if !t.Run(name, phase) {
		t.FailNow()
	}
}

func sameJSONRaw(a, b json.RawMessage) bool {
	var av, bv any
	return json.Unmarshal(a, &av) == nil && json.Unmarshal(b, &bv) == nil && reflect.DeepEqual(av, bv)
}
func sameJSON(a, b any) bool {
	ar, _ := json.Marshal(a)
	br, _ := json.Marshal(b)
	return sameJSONRaw(ar, br)
}
func compareProducts(t *testing.T, a, b []catalog.Product, order catalog.Sort, offset int64) {
	t.Helper()
	if !reflect.DeepEqual(ids(a), ids(b)) {
		t.Fatalf("ID order mismatch sort=%s offset=%d", order, offset)
	}
	for i := range a {
		// Frozen contract orders offers by price only, not tie order between stores.
		less := func(o []catalog.Offer) func(int, int) bool {
			return func(i, j int) bool {
				if o[i].Price != o[j].Price {
					return o[i].Price < o[j].Price
				}
				return o[i].StoreCode < o[j].StoreCode
			}
		}
		aa, bb := a[i], b[i]
		aa.Offers = append([]catalog.Offer(nil), aa.Offers...)
		bb.Offers = append([]catalog.Offer(nil), bb.Offers...)
		sort.Slice(aa.Offers, less(aa.Offers))
		sort.Slice(bb.Offers, less(bb.Offers))
		if !aa.SnapshotAt.Equal(bb.SnapshotAt) {
			t.Fatal("snapshot parity")
		}
		bb.SnapshotAt = aa.SnapshotAt
		if !sameJSON(aa, bb) {
			t.Fatalf("product semantic mismatch sort=%s page offset=%d index=%d", order, offset, i)
		}
	}
}
