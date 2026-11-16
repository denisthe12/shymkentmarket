package szpt

import (
	"reflect"
	"regexp"
	"strings"
	"testing"
)

var wantSlugs = []string{"rice", "buckwheat", "sour-cream", "cottage-cheese", "cheese", "milk", "kefir", "sunflower-oil", "eggs", "butter",
	"flour", "bread", "pasta-horns", "potatoes", "carrots", "onions", "cabbage", "tomatoes", "cucumbers", "apples", "sugar",
	"beef", "minced-meat", "lamb", "horse-meat", "fish", "chicken-parts", "chicken", "black-tea", "salt"}

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
		"cucumbers": true, "apples": true, "beef": true, "minced-meat": true, "lamb": true, "horse-meat": true, "fish": true, "chicken-parts": true, "chicken": true}
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

// matches reports whether a product name passes a rule's name patterns, as PostgreSQL ~* does in SQL.
func matches(t *testing.T, g Rule, name string) bool {
	t.Helper()
	for _, p := range g.Include {
		if !regexp.MustCompile("(?i)" + p).MatchString(name) {
			return false
		}
	}
	return g.Exclude == "" || !regexp.MustCompile("(?i)"+g.Exclude).MatchString(name)
}

// Spec: docs/superpowers/specs/2026-11-15-szpt-phase3-salt-tea-fish-design.md, part 3 and part 5.
func TestPhase3Patterns(t *testing.T) {
	cases := []struct {
		slug    string
		in, out []string
	}{
		{"lamb",
			[]string{"Баранина Задок", "Баранина Тибон", "Баранина Шейная часть", "Мясо баранины на кости"},
			[]string{"Баранина тушеная Кублей 325 г", "Колбаса Рамай Гриль с Бараниной 600г", "П/ф Шашлык из баранины вес",
				"Полуфабрикат люля-кебаб Кублей баранины 0,45кг", "Приправа Приправыч д/баранины 15г"}},
		{"horse-meat",
			[]string{"п/ф конина жая охл", "п/ф конина тибон на кости охл", "Конина мякоть охл"},
			[]string{"п/ф конина соленая охл", "П/ф Конина Кублей Казы вес", "Тушеная конина Кублей 325 г",
				"Арахис Big Bob в оболочке вяленая конина 50 г", "Сухарики гренки ржаные Вяленая конина 100г"}},
		{"chicken-parts", nil, []string{"Баранина ножка", "Баранина тушка", "Конина голень"}},
		{"chicken", nil, []string{"Баранина ножка", "Баранина тушка", "Конина голень"}},
		{"fish",
			[]string{"Рыба Судак охл", "Рыба Сазан большой охл", "Сазан потрошенный вес", "Филе судака с/м", "Карп живой", "Судак охлажденный", "Рыба Карась с/м"},
			[]string{"Лещ вяленый", "Лещ холодного копчения", "Сазан жареный", "Карпаччо из говядины", "Чипсы рыбные Сазанчик",
				"Соус для судака", "Икра сазана"}},
		{"black-tea",
			[]string{"Чай Ассам черный листовой 250 г", "Чай Champion Keniya Sunset черный гранул 1000г/12",
				"Чай Bayce кенийский гранулированный 500г Казахстан 1/20", "ЧАЙ ЖАМБО КЕНИЙСКИЙ ГРАНУЛ. 250ГР",
				"Чай черный АЗЕРЧАЙ байховый 100 г", "Чай Greenfield Kenyan sunrise black листовой 100г Россия 1/14",
				"Чай Шах Голд СТС черный гранулированный 230 г", "Чай чёрный Champion Sunset 250 г"},
			[]string{"Чай Ахмад Классический черный 40 пак", "Чай Ахмад Английский завтрак 100*2г/8",
				"Чай Beta Tea Earl Grey черный гранул 250 г", "Чай Beta Tea Dance of Roses черный 100 г", "Чай Ассам зеленый 100г",
				"Чай Lipton черный персик манго пирамидка 36г", "Чай Beta Magic Assam с бергамотам черный 100г",
				"Кофе Jacobs Monarch 95 г", "Чай Beta Tea Tropical Kenya гран. черный 500г Казахстан 1/20",
				"Чай Жемчужина Нила Бергамот СТС 210г Россия 1/24", "Чай Tess Caramel charm black 20*1,8г", "Чай MacTea 3в1 20*55",
				"Чай Gilemkhan черная смородина 175 г", "Чай Beta Тропическая Кения гранулированный 250 г",
				"Чай Tess Pleasure Black Tea 200 г", "Чай Tess Pleasure черный гранулированный 100 г", "Чай Tess Orange black листовой 100 г",
				"Чай Greenfield Spicy Ginger black 100 г", "Чай Kenya black with apple and cinnamon 100 г",
				"Чай чёрный Принцесса Нури 100 г 50 шт.", "Чай Майский черный 25шт"}},
		{"salt",
			[]string{"Соль Ассоль йодированная 1 кг", "Соль Илецкая йодированная 1 кг", "СОЛЬ ЛОТОС 400ГР",
				"Соль Royal food Морская крупного помола дойпак 500 г", "Тұз йодталған 1 кг"},
			[]string{"СОЛЬ ЭКСТРА 900ГР", "Соль Royal food Extra 200г", "Соль для ванн Аромика Череда, 1000 г",
				"Соль для посудомоечных машин \"Finish\" 1.5 кг", "Соль с травами Приправыч 300 г", "Соль черная четверговая 200 г"}},
	}
	for _, c := range cases {
		g, ok := Lookup(c.slug)
		if !ok {
			t.Errorf("%s: group missing", c.slug)
			continue
		}
		for _, n := range c.in {
			if !matches(t, g, n) {
				t.Errorf("%s: %q must be a member", c.slug, n)
			}
		}
		for _, n := range c.out {
			if matches(t, g, n) {
				t.Errorf("%s: %q must not be a member", c.slug, n)
			}
		}
	}
}

func TestPhase3Rules(t *testing.T) {
	want := map[string]struct {
		name, category string
		min            float64
		weighted       bool
	}{
		"lamb":       {"Баранина", "meat", 500, true},
		"horse-meat": {"Конина", "meat", 500, true},
		"fish":       {"Рыба (лещ, карась, судак, карп, сазан)", "fish", 300, true},
		"black-tea":  {"Чай чёрный", "tea-coffee", 40, false},
		"salt":       {"Соль поваренная пищевая", "salt", 200, false},
	}
	for slug, w := range want {
		g, ok := Lookup(slug)
		if !ok {
			t.Errorf("%s: group missing", slug)
			continue
		}
		if g.Name != w.name || g.Category != w.category || g.MinSize != w.min || g.Weighted != w.weighted || g.Unit != Kg ||
			!reflect.DeepEqual(g.SizeKeys, []string{"weightGrams"}) {
			t.Errorf("%s: rule = %+v", slug, g)
		}
	}
}
