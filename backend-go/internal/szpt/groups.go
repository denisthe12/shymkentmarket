package szpt

// Rule selects group members in SQL (PostgreSQL ~*, case-insensitive). Patterns avoid \b, \m and \M:
// word boundaries are unreliable for Cyrillic, so they are spelled as the class [^а-яё].
// Include: every pattern must match. Exclude: one alternation, empty means none.
// Spec: docs/superpowers/specs/2026-11-12-scrum-25-szpt-design.md, part 2.
type Rule struct {
	Slug     string   `json:"slug"`
	Name     string   `json:"-"`
	Category string   `json:"category"`
	Unit     Unit     `json:"-"`
	SizeKeys []string `json:"size_keys"`
	MinSize  float64  `json:"min_size"`
	Include  []string `json:"include"`
	Exclude  string   `json:"exclude"`
	FatMin   *float64 `json:"fat_min"`
	FatMax   *float64 `json:"fat_max"`
}

const (
	// Weighted goods carry a per-kg price and no package size.
	weighted = `(^|[^а-яё])вес([^а-яё]|$)|весов`
	lactose  = `безлакт|низколакт`
)

func fat(lo, hi float64) (*float64, *float64) { return &lo, &hi }

func exclude(patterns ...string) string {
	out := ""
	for _, p := range patterns {
		if p == "" {
			continue
		}
		if out != "" {
			out += "|"
		}
		out += p
	}
	return out
}

var (
	cottageMin, cottageMax = fat(5, 9)
	cheeseMin, cheeseMax   = fat(40, 50)
	milkMin, milkMax       = fat(2.2, 6)
	kefirMin, kefirMax     = fat(2, 3)
	butterMin, butterMax   = fat(72.5, 80)
)

// Groups is the fixed section order.
var Groups = []Rule{
	{Slug: "rice", Name: "Рис", Category: "groats", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200,
		Include: []string{`^рис[ ,]`},
		Exclude: exclude(`басмати|жасмин|длиннозерн|пропарен|бурый|дикий|красный|ч[её]рный|девзира|суши|арборио|паэль|пакетик|варочн`, weighted)},
	{Slug: "buckwheat", Name: "Гречка", Category: "groats", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200,
		Include: []string{`^греч|^крупа греч|ядриц`},
		Exclude: exclude(`продел|хлопь|пакетик|варочн|зел[её]н|лапш|мука`, weighted)},
	{Slug: "sour-cream", Name: "Сметана", Category: "dairy", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 100,
		Include: []string{`^сметан`},
		Exclude: exclude(`^сметанн|соус|напит`, lactose, weighted)},
	{Slug: "cottage-cheese", Name: "Творог", Category: "dairy", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 100,
		Include: []string{`^творог`},
		Exclude: exclude(`масса|десерт|сырок|изюм|ванил`, lactose, weighted),
		FatMin:  cottageMin, FatMax: cottageMax},
	{Slug: "cheese", Name: "Сыр", Category: "dairy", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 100,
		Include: []string{`^сыр[ ,]`},
		Exclude: exclude(`плавл|творож|колбас|косич|сулугун|брынз|фета|моцарел|рикот|маскарпон|адыг|чечил|паутин`, weighted),
		FatMin:  cheeseMin, FatMax: cheeseMax},
	{Slug: "milk", Name: "Молоко", Category: "milk", Unit: L, SizeKeys: []string{"volumeMl", "weightGrams"}, MinSize: 200,
		Include: []string{`.`},
		Exclude: exclude(`топл[её]н|шоколад|клубник|банан|ванил|карамел`, lactose, weighted),
		FatMin:  milkMin, FatMax: milkMax},
	{Slug: "kefir", Name: "Кефир", Category: "dairy", Unit: L, SizeKeys: []string{"volumeMl", "weightGrams"}, MinSize: 200,
		Include: []string{`^кефир`},
		Exclude: exclude(`protein|чиа|черник|фрукт|ягод`, lactose, weighted),
		FatMin:  kefirMin, FatMax: kefirMax},
	{Slug: "sunflower-oil", Name: "Подсолнечное масло", Category: "oil", Unit: L, SizeKeys: []string{"volumeMl"}, MinSize: 200,
		Include: []string{`подсолн`},
		Exclude: exclude(weighted)},
	{Slug: "eggs", Name: "Яйца I категории", Category: "eggs", Unit: Pcs10, SizeKeys: []string{"packageCount"}, MinSize: 1,
		Include: []string{`кур`, `с1|c1|1 категор|i категор`},
		Exclude: exclude(`перепел`, weighted)},
	{Slug: "butter", Name: "Сливочное масло", Category: "dairy", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 100,
		Include: []string{`^масло.*сливоч|^сливочное масло`},
		Exclude: exclude(`спред|растит|(^|[^а-яё])сол[её]н|шоколад|наполн|какао`, weighted),
		FatMin:  butterMin, FatMax: butterMax},
}

func Lookup(slug string) (Rule, bool) {
	for _, g := range Groups {
		if g.Slug == slug {
			return g, true
		}
	}
	return Rule{}, false
}
