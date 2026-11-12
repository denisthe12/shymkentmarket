package httpapi

import (
	"net/http"
	"net/url"
	"strconv"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/szpt"
	"github.com/go-chi/chi/v5"
)

type szptGroupsWire struct {
	Groups []szpt.Group `json:"groups"`
}

// Same ISO millisecond snapshotAt as productWire; szpt.Product.Offers replaces the catalog offers.
type szptProductWire struct {
	szpt.Product
	SnapshotAt string `json:"snapshotAt"`
}

// parseSzptQuery accepts only size (repeated decimal > 0), sort, limit and offset (single).
func parseSzptQuery(group string, raw url.Values) (szpt.Query, error) {
	q := szpt.Query{Group: group, Sort: szpt.PriceAsc, Limit: 24}
	for key, values := range raw {
		switch key {
		case "size":
			for _, v := range values {
				if !decimalNumber.MatchString(v) {
					return q, catalog.ErrInvalidQuery
				}
				n, err := strconv.ParseFloat(v, 64)
				if err != nil || n <= 0 {
					return q, catalog.ErrInvalidQuery
				}
				q.Sizes = append(q.Sizes, n)
			}
		case "sort", "limit", "offset":
			if len(values) != 1 {
				return q, catalog.ErrInvalidQuery
			}
		default:
			return q, catalog.ErrInvalidQuery
		}
	}
	if values, ok := raw["sort"]; ok {
		q.Sort = szpt.Sort(values[0])
		if q.Sort != szpt.PriceAsc && q.Sort != szpt.UnitPriceAsc {
			return q, catalog.ErrInvalidQuery
		}
	}
	for _, key := range []string{"limit", "offset"} {
		values, ok := raw[key]
		if !ok {
			continue
		}
		if !decimalInteger.MatchString(values[0]) {
			return q, catalog.ErrInvalidQuery
		}
		n, err := strconv.ParseUint(values[0], 10, 64)
		if err != nil || n > 9007199254740991 {
			return q, catalog.ErrInvalidQuery
		}
		if key == "limit" {
			if n < 1 || n > 100 {
				return q, catalog.ErrInvalidQuery
			}
			q.Limit = int(n)
		} else {
			q.Offset = int64(n)
		}
	}
	return q, nil
}

func (d Dependencies) szptGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := d.Szpt.ListGroups(r.Context())
	respond(w, szptGroupsWire{groups}, err)
}

func (d Dependencies) szptProducts(w http.ResponseWriter, r *http.Request) {
	group := chi.URLParam(r, "group")
	if _, ok := szpt.Lookup(group); !ok {
		respond(w, nil, catalog.ErrNotFound)
		return
	}
	raw, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		respond(w, nil, catalog.ErrInvalidQuery)
		return
	}
	q, err := parseSzptQuery(group, raw)
	if err != nil {
		respond(w, nil, err)
		return
	}
	products, err := d.Szpt.ListProducts(r.Context(), q)
	if err != nil {
		respond(w, nil, err)
		return
	}
	out := make([]szptProductWire, 0, len(products))
	for _, p := range products {
		out = append(out, szptProductWire{p, p.SnapshotAt.UTC().Format("2006-01-02T15:04:05.000Z")})
	}
	respond(w, out, nil)
}
