package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/szpt"
)

type testSzpt struct {
	err   error
	query szpt.Query
	calls int
}

func (r *testSzpt) ListGroups(context.Context) ([]szpt.Group, error) {
	return []szpt.Group{{Slug: "rice", Name: "Рис", Unit: szpt.Kg, Sizes: []float64{500, 1000}, Count: 2, DefaultSort: szpt.PriceAsc},
		{Slug: "potatoes", Name: "Картофель", Unit: szpt.Kg, Sizes: []float64{}, Count: 3, DefaultSort: szpt.UnitPriceAsc}}, r.err
}
func (r *testSzpt) ListProducts(_ context.Context, q szpt.Query) ([]szpt.Product, error) {
	r.calls++
	r.query = q
	unit := szpt.UnitPrice{Value: 840, Unit: szpt.Kg}
	if q.Group == "potatoes" {
		return []szpt.Product{{
			Product:      catalog.Product{ID: "p1", Name: "Картофель", Attributes: map[string]json.RawMessage{}, MinPrice: 300},
			SoldByWeight: true,
			UnitPrice:    &unit,
			Offers:       []szpt.Offer{{Offer: catalog.Offer{StoreCode: catalog.DINA, StoreName: "Dina", Price: 300}, UnitPrice: &unit, SoldByWeight: true}},
		}}, r.err
	}
	return []szpt.Product{{
		Product: catalog.Product{ID: "r3", Name: "Рис Тест 500 г", Attributes: map[string]json.RawMessage{}, MinPrice: 420,
			SnapshotAt: time.Date(2026, 11, 11, 1, 0, 51, 947e6, time.UTC)},
		UnitPrice: &unit,
		Offers:    []szpt.Offer{{Offer: catalog.Offer{StoreCode: catalog.DINA, StoreName: "Dina", Price: 420}, UnitPrice: &unit}},
	}}, r.err
}

func TestParseSzptQuery(t *testing.T) {
	ok := []struct {
		raw  string
		want szpt.Query
	}{
		{"", szpt.Query{Group: "rice", Limit: 24}},
		{"size=800&size=1000", szpt.Query{Group: "rice", Sizes: []float64{800, 1000}, Limit: 24}},
		{"size=1000.0", szpt.Query{Group: "rice", Sizes: []float64{1000}, Limit: 24}},
		{"sort=price_asc", szpt.Query{Group: "rice", Sort: szpt.PriceAsc, Limit: 24}},
		{"sort=unit_price_asc&limit=5&offset=10", szpt.Query{Group: "rice", Sort: szpt.UnitPriceAsc, Limit: 5, Offset: 10}},
	}
	for _, c := range ok {
		raw, _ := url.ParseQuery(c.raw)
		got, err := parseSzptQuery("rice", raw)
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("%q: %+v, %v; want %+v", c.raw, got, err, c.want)
		}
	}
	for _, bad := range []string{"size=abc", "size=-1", "size=1e3", "size=", "size=0", "sort=price_desc", "sort=a&sort=b",
		"limit=0", "limit=101", "limit=1.5", "offset=-1", "offset=9007199254740992", "category=milk"} {
		raw, _ := url.ParseQuery(bad)
		if _, err := parseSzptQuery("rice", raw); !errors.Is(err, catalog.ErrInvalidQuery) {
			t.Errorf("%q: err = %v, want ErrInvalidQuery", bad, err)
		}
	}
}

func szptRouter(repo *testSzpt) *testSzptServer {
	deps := testDependencies(pingFunc(func(context.Context) error { return nil }))
	deps.Szpt = repo
	return &testSzptServer{deps: deps}
}

type testSzptServer struct{ deps Dependencies }

func (s *testSzptServer) get(method, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	Router(testConfig(), observability.New(&bytes.Buffer{}, "info"), s.deps).ServeHTTP(w, httptest.NewRequest(method, path, nil))
	return w
}

func TestSzptRoutes(t *testing.T) {
	repo := &testSzpt{}
	s := szptRouter(repo)
	w := s.get("GET", "/api/szpt")
	if w.Code != 200 || w.Header().Get("Content-Type") != "application/json" ||
		w.Body.String() != `{"groups":[{"slug":"rice","name":"Рис","unit":"kg","sizes":[500,1000],"count":2,"defaultSort":"price_asc"},{"slug":"potatoes","name":"Картофель","unit":"kg","sizes":[],"count":3,"defaultSort":"unit_price_asc"}]}` {
		t.Fatalf("groups: %d %s", w.Code, w.Body.String())
	}
	w = s.get("GET", "/api/szpt/rice/products?sort=unit_price_asc")
	if w.Code != 200 || !reflect.DeepEqual(repo.query, szpt.Query{Group: "rice", Sort: szpt.UnitPriceAsc, Limit: 24}) {
		t.Fatalf("products: %d %+v", w.Code, repo.query)
	}
	body := w.Body.String()
	for _, want := range []string{`"minPrice":420,"offers":[{"storeCode":"DINA","storeName":"Dina","price":420,"oldPrice":null,"unitPrice":{"value":840,"unit":"kg"},"soldByWeight":false}]`,
		`"unitPrice":{"value":840,"unit":"kg"}`, `"snapshotAt":"2026-11-11T01:00:51.947Z"`} {
		if !strings.Contains(body, want) {
			t.Errorf("body lacks %s: %s", want, body)
		}
	}
	if strings.Count(body, `"offers"`) != 1 {
		t.Errorf("catalog offers must be replaced, not duplicated: %s", body)
	}
	w = s.get("GET", "/api/szpt/potatoes/products")
	if w.Code != 200 || repo.query.Sort != "" || strings.Count(w.Body.String(), `"soldByWeight":true`) != 2 {
		t.Errorf("weighted: %d %+v %s", w.Code, repo.query, w.Body.String())
	}
	calls := repo.calls
	if w := s.get("GET", "/api/szpt/nope/products"); w.Code != 404 || repo.calls != calls {
		t.Errorf("unknown group: %d, repository called %d times", w.Code, repo.calls-calls)
	}
	if w := s.get("GET", "/api/szpt/rice/products?size=abc"); w.Code != 400 {
		t.Errorf("bad size: %d", w.Code)
	}
	if w := s.get("POST", "/api/szpt"); w.Code != 405 {
		t.Errorf("POST: %d", w.Code)
	}
	for _, err := range []struct {
		err    error
		status int
	}{{catalog.ErrNotFound, 404}, {catalog.ErrInvalidQuery, 400}, {errors.New("private-password/SQL/host"), 500}} {
		failing := szptRouter(&testSzpt{err: err.err})
		for _, path := range []string{"/api/szpt", "/api/szpt/rice/products"} {
			if path == "/api/szpt" && err.status != 500 {
				continue
			}
			w := failing.get("GET", path)
			if w.Code != err.status || strings.Contains(w.Body.String(), "private") {
				t.Errorf("%s with %v: %d %s", path, err.err, w.Code, w.Body.String())
			}
		}
	}
}

// Existing endpoints keep their exact wire shape after the SZPT routes are added.
func TestExistingRoutesUnchanged(t *testing.T) {
	s := szptRouter(&testSzpt{})
	for path, want := range map[string]string{
		"/api/products/opaque": `{"id":"opaque","name":"Milk","brand":null,"category":{"slug":"","name":""},"imageUrl":null,"attributes":{},"minPrice":100,"offers":[{"storeCode":"DINA","storeName":"Dina","price":100,"oldPrice":null}],"snapshotAt":"2026-10-01T00:00:00.000Z"}`,
		"/api/dashboard":       `{"summary":{"canonicalProducts":0,"stores":0,"matchedAcrossStores":0,"snapshotAt":""},"priceSpreads":[],"locations":[],"baskets":[]}`,
	} {
		if w := s.get("GET", path); w.Code != 200 || w.Body.String() != want {
			t.Errorf("%s = %s", path, w.Body.String())
		}
	}
}
