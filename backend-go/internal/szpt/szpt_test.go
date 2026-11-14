package szpt

import (
	"reflect"
	"regexp"
	"strings"
	"testing"
)

var wantSlugs = []string{"rice", "buckwheat", "sour-cream", "cottage-cheese", "cheese", "milk", "kefir", "sunflower-oil", "eggs", "butter",
	"flour", "bread", "pasta-horns", "potatoes", "carrots", "onions", "cabbage", "tomatoes", "cucumbers", "apples", "sugar",
	"beef", "minced-meat", "chicken-parts", "chicken"}

func TestGroupOrder(t *testing.T) {
	got := make([]string, 0, len(Groups))
	for _, g := range Groups {
		got = append(got, g.Slug)
	}
	if !reflect.DeepEqual(got, wantSlugs) {
		t.Fatalf("group order = %v, want %v", got, wantSlugs)
	}
}

func TestGroupsLookupAndExclusions(t *testing.T) {
	milk, ok := Lookup("milk")
	if !ok || milk.Unit != L || !reflect.DeepEqual(milk.SizeKeys, []string{"volumeMl", "weightGrams"}) {
		t.Fatalf("milk rule = %+v", milk)
	}
	if _, ok := Lookup("nope"); ok {
		t.Fatal("unknown group must not resolve")
	}
	lactose := map[string]bool{"sour-cream": true, "cottage-cheese": true, "milk": true, "kefir": true}
	for _, g := range Groups {
		if !g.Weighted && !strings.Contains(g.Exclude, "весов") {
			t.Errorf("%s: weighted exclusion missing", g.Slug)
		}
		if strings.Contains(g.Exclude, "безлакт") != lactose[g.Slug] {
			t.Errorf("%s: lactose exclusion = %v, want %v", g.Slug, !lactose[g.Slug], lactose[g.Slug])
		}
	}
}

func TestWeightedRules(t *testing.T) {
	weightedSlugs := map[string]bool{"potatoes": true, "carrots": true, "onions": true, "cabbage": true, "tomatoes": true,
		"cucumbers": true, "apples": true, "beef": true, "minced-meat": true, "chicken-parts": true, "chicken": true}
	for _, g := range Groups {
		if g.Weighted != weightedSlugs[g.Slug] {
			t.Errorf("%s: Weighted = %v, want %v", g.Slug, g.Weighted, weightedSlugs[g.Slug])
		}
		if g.Weighted {
			if g.Unit != Kg {
				t.Errorf("%s: unit = %s, want kg", g.Slug, g.Unit)
			}
			if g.DefaultSort() != UnitPriceAsc {
				t.Errorf("%s: default sort = %s", g.Slug, g.DefaultSort())
			}
			if strings.Contains(g.Exclude, weighted) {
				t.Errorf("%s: weighted group must not exclude weighted goods", g.Slug)
			}
		} else if g.DefaultSort() != PriceAsc {
			t.Errorf("%s: default sort = %s, want price_asc", g.Slug, g.DefaultSort())
		}
	}
}

func TestPriceOfWeighted(t *testing.T) {
	if got := PriceOfWeighted(1480, 1800); got != (UnitPrice{Value: 822.22, Unit: Kg}) {
		t.Errorf("PriceOfWeighted(1480,1800) = %+v", got)
	}
	if got := PriceOfWeighted(539, 1000); got != (UnitPrice{Value: 539, Unit: Kg}) {
		t.Errorf("PriceOfWeighted(539,1000) = %+v", got)
	}
}

func TestGroupPatternsCompile(t *testing.T) {
	for _, g := range Groups {
		for _, p := range append(append([]string{}, g.Include...), g.Exclude) {
			if _, err := regexp.Compile("(?i)" + p); err != nil {
				t.Errorf("%s: pattern %q: %v", g.Slug, p, err)
			}
		}
	}
}

func TestPriceOf(t *testing.T) {
	cases := []struct {
		price int
		size  float64
		unit  Unit
		want  float64
	}{
		{420, 500, Kg, 840},
		{710, 1000, Kg, 710},
		{45600, 6000, Kg, 7600},
		{69, 1, Pcs10, 690},
		{100, 3, Kg, 33333.33},
		{1, 1600, Kg, 0.63},
		{478, 900, L, 531.11},
	}
	for _, c := range cases {
		got := PriceOf(c.price, c.size, c.unit)
		if got.Value != c.want || got.Unit != c.unit {
			t.Errorf("PriceOf(%d,%v,%s) = %+v, want %v", c.price, c.size, c.unit, got, c.want)
		}
	}
}
