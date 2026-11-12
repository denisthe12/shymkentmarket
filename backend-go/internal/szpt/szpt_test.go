package szpt

import (
	"reflect"
	"regexp"
	"strings"
	"testing"
)

func TestGroupsOrderAndLookup(t *testing.T) {
	want := []string{"rice", "buckwheat", "sour-cream", "cottage-cheese", "cheese", "milk", "kefir", "sunflower-oil", "eggs", "butter"}
	got := make([]string, 0, len(Groups))
	for _, g := range Groups {
		got = append(got, g.Slug)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("group order = %v, want %v", got, want)
	}
	milk, ok := Lookup("milk")
	if !ok || milk.Unit != L || !reflect.DeepEqual(milk.SizeKeys, []string{"volumeMl", "weightGrams"}) {
		t.Fatalf("milk rule = %+v", milk)
	}
	if _, ok := Lookup("nope"); ok {
		t.Fatal("unknown group must not resolve")
	}
	lactose := map[string]bool{"sour-cream": true, "cottage-cheese": true, "milk": true, "kefir": true}
	for _, g := range Groups {
		if !strings.Contains(g.Exclude, "весов") {
			t.Errorf("%s: weighted exclusion missing", g.Slug)
		}
		if strings.Contains(g.Exclude, "безлакт") != lactose[g.Slug] {
			t.Errorf("%s: lactose exclusion = %v, want %v", g.Slug, !lactose[g.Slug], lactose[g.Slug])
		}
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
