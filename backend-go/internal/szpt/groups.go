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
	// Weighted groups also take goods sold by weight (no package size); their default sort is per-kg price.
	Weighted bool `json:"weighted"`
}

// DefaultSort is the sort used when the request has none.
func (r Rule) DefaultSort() Sort {
	if r.Weighted {
		return UnitPriceAsc
	}
	return PriceAsc
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
		Exclude: exclude(`басмати|жасмин|длиннозерн|пропарен|бурый|дикий|красный|ч[её]рный|девзира|суши|арборио|паэль|пакетик|варочн|паром`, weighted)},
	{Slug: "buckwheat", Name: "Гречка", Category: "groats", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200,
		Include: []string{`^греч|^крупа греч|ядриц`},
		Exclude: exclude(`продел|хлопь|пакетик|варочн|зел[её]н|лапш|мука`, weighted)},
	{Slug: "sour-cream", Name: "Сметана", Category: "dairy", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 100,
		Include: []string{`^сметан`},
		Exclude: exclude(`^сметанн|соус|напит`, lactose, weighted)},
	{Slug: "cottage-cheese", Name: "Творог", Category: "dairy", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 100,
		Include: []string{`^творог`},
		Exclude: exclude(`масса|десерт|сырок|изюм|ванил|клубник|малин|манго|маракуй|черник|персик|вишн|абрикос`, lactose, weighted),
		FatMin:  cottageMin, FatMax: cottageMax},
	{Slug: "cheese", Name: "Сыр", Category: "dairy", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 100,
		Include: []string{`^сыр[ ,]`},
		Exclude: exclude(`плавл|творож|колбас|косич|сулугун|брынз|фета|моцарел|рикот|маскарпон|адыг|чечил|паутин|mozzarel|мягк|(^|[^а-яё])бри([^а-яё]|$)|brie|blue|блю|камамбер|camembert|плесен`, weighted),
		FatMin:  cheeseMin, FatMax: cheeseMax},
	{Slug: "milk", Name: "Молоко", Category: "milk", Unit: L, SizeKeys: []string{"volumeMl", "weightGrams"}, MinSize: 200,
		Include: []string{`.`},
		Exclude: exclude(`топл[её]н|шоколад|клубник|банан|ванил|карамел|молокосодерж`, lactose, weighted),
		FatMin:  milkMin, FatMax: milkMax},
	{Slug: "kefir", Name: "Кефир", Category: "dairy", Unit: L, SizeKeys: []string{"volumeMl", "weightGrams"}, MinSize: 200,
		Include: []string{`^кефир`},
		Exclude: exclude(`protein|чиа|черник|фрукт|ягод`, lactose, weighted),
		FatMin:  kefirMin, FatMax: kefirMax},
	{Slug: "sunflower-oil", Name: "Подсолнечное масло", Category: "oil", Unit: L, SizeKeys: []string{"volumeMl"}, MinSize: 200,
		Include: []string{`подсолн`},
		Exclude: exclude(weighted)},
	{Slug: "eggs", Name: "Яйца I категории", Category: "eggs", Unit: Pcs10, SizeKeys: []string{"packageCount"}, MinSize: 1,
		// С1 (Cyrillic or Latin C) only as a standalone token: «фас10шт» must not read as С1
		Include: []string{`кур`, `(^|[^а-яёa-z0-9])[сc]1([^0-9]|$)|1 категор|i категор`},
		Exclude: exclude(`перепел`, weighted)},
	{Slug: "butter", Name: "Сливочное масло", Category: "dairy", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 100,
		Include: []string{`^масло.*сливоч|^сливочное масло`},
		Exclude: exclude(`спред|растит|(^|[^а-яё])сол[её]н|шоколад|наполн|какао`, weighted),
		FatMin:  butterMin, FatMax: butterMax},
	{Slug: "flour", Name: "Мука пшеничная 1 сорта", Category: "groats", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 500,
		Include: []string{`^мука`, `(^|[^а-яё0-9])(1/?с([^а-яё]|$)|1 с([^а-яё ]|$| [^а-яё])|1 сорт|первый сорт)`},
		Exclude: exclude(`высш|в/с|экстра|кукуруз|ржан|рисов|овсян|гречн|цельнозерн|блин|оладь`, weighted)},
	{Slug: "bread", Name: "Хлеб пшеничный", Category: "bread", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200,
		Include: []string{`^хлеб `},
		Exclude: exclude(`ржан|бородин|литов|рижск|зерн|злак|отруб|солод|тост|сэндвич|лаваш|хлебц|палоч|бездрож|кукуруз|овсян|льнян|фитнес|здоров|клюкв|семеч|сыр|чиабат|багет|bionan`, weighted)},
	{Slug: "pasta-horns", Name: "Рожки", Category: "groats", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200,
		Include: []string{`рожк|рожок`},
		Exclude: exclude(`рисов|цельнозерн|гнезд`, weighted)},
	{Slug: "potatoes", Name: "Картофель", Category: "vegetables", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 500, Weighted: true,
		Include: []string{`^картоф`},
		Exclude: exclude(`фри|пюре|чипс|батат|сладк`)},
	{Slug: "carrots", Name: "Морковь", Category: "vegetables", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200, Weighted: true,
		Include: []string{`^морков`},
		Exclude: exclude(`корей|нарезк|мини|сок`)},
	{Slug: "onions", Name: "Лук репчатый", Category: "vegetables", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200, Weighted: true,
		Include: []string{`^лук`},
		Exclude: exclude(`зел|порей|шалот|перо|крас|ялт|нарезк`)},
	{Slug: "cabbage", Name: "Капуста белокочанная", Category: "vegetables", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 500, Weighted: true,
		Include: []string{`^капуст`},
		Exclude: exclude(`цветн|брокк|пекин|краснокоч|савой|кольраб|брюссел|морск|квашен|салат|нарезк|корей`)},
	{Slug: "tomatoes", Name: "Помидоры", Category: "vegetables", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200, Weighted: true,
		Include: []string{`^помидор|^томат`},
		Exclude: exclude(`черри|cherry|виноград|паст|сок|соус|вялен|сушен`)},
	{Slug: "cucumbers", Name: "Огурцы", Category: "vegetables", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200, Weighted: true,
		Include: []string{`^огур`},
		Exclude: exclude(`корнишон|маринов|сол[её]н|консерв`)},
	{Slug: "apples", Name: "Яблоки", Category: "vegetables", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 500, Weighted: true,
		Include: []string{`^яблок`},
		Exclude: exclude(`сок|чипс|сушен|пюре|джем|повид`)},
	{Slug: "sugar", Name: "Сахар-песок", Category: "sugar", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 500,
		Include: []string{`^сахар`},
		Exclude: exclude(`рафин|пудр|ванил|тростн|коричн|кусков|стик|порцион|демерар`, weighted)},
	{Slug: "beef", Name: "Говядина", Category: "meat", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 500, Weighted: true,
		Include: []string{`говя`},
		Exclude: exclude(`фарш|котлет|люля|шашлык|марин|стейк|язык|печень|(^|[^а-яё])ног[аиу]?([^а-яё]|$)|^кост|суповой|студн|казы`)},
	{Slug: "minced-meat", Name: "Мясной фарш", Category: "meat", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 200, Weighted: true,
		Include: []string{`фарш`},
		Exclude: exclude(`кур|индей|манты|котлетн`)},
	{Slug: "chicken-parts", Name: "Мясо кур (бедро, голень, окорочка)", Category: "meat", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 300, Weighted: true,
		Include: []string{`бедр|голен|окороч|четверт|ножк`},
		Exclude: exclude(`утк|утин|утён|утен|марин|барбекю|запеч|филе`)},
	{Slug: "chicken", Name: "Куры (тушка)", Category: "meat", Unit: Kg, SizeKeys: []string{"weightGrams"}, MinSize: 1000, Weighted: true,
		Include: []string{`тушк|^куры|^курица|цыпл[её]н.*бройлер|бройлер`},
		Exclude: exclude(`табака|гриль|бульон|грудк|крыл|филе|бедр|голен|окороч|четверт|ножк|утк|утин|рагу|рулет|шашлык`)},
}

func Lookup(slug string) (Rule, bool) {
	for _, g := range Groups {
		if g.Slug == slug {
			return g, true
		}
	}
	return Rule{}, false
}
