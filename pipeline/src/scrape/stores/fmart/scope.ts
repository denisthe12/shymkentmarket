import type { CategorySlug } from '../../../agent/taxonomy.js'
import type { FmartLeaf, FmartSection } from './parse.js'

type LeafRow = readonly [id: string, slug: CategorySlug, name: string]

const section = (
  id: string,
  root: string,
  name: string,
  leaves: readonly LeafRow[],
  excluded: readonly string[] = [],
  fresh = false,
): FmartSection => ({
  id,
  fresh,
  leaves: new Map(leaves.map(([leafId, slug, leaf]): [string, FmartLeaf] => [leafId, { id: leafId, slug, path: [root, name, leaf] }])),
  excluded: new Set(excluded),
})

const DAIRY = 'Молочные продукты'
const GROCERY = 'Бакалея'
const BREAD = 'Хлеб'
const FROZEN = 'Заморозка'
const DELI = 'Гастрономия'
const FRESH = 'Свежие овощи и фрукты'
const POULTRY = 'Свежая птица и рыба'

/** Catalogue sections; order = seed priority. Excluded leaves are known and not wanted, other leaves are reported as unknown. */
export const FMART_SECTIONS: readonly FmartSection[] = [
  section('3352', DAIRY, 'Молоко', [
    ['3873', 'milk', 'Молоко длительного хранения'],
    ['4202', 'milk', 'Молоко короткого хранения'],
  ], ['3851', '4137', '4211']),
  section('3339', DAIRY, 'Творог', [['3913', 'dairy', 'Творог']], ['3809']),
  section('3098', DAIRY, 'Сметана', [['4021', 'dairy', 'Сметана']]),
  section('3096', DAIRY, 'Кисломолочные', [
    ['3905', 'dairy', 'Кефир'],
    ['4198', 'dairy', 'Ряженка'],
    ['4147', 'dairy', 'Простокваша'],
  ]),
  section('3268', DAIRY, 'Сливки', [['4156', 'dairy', 'Сливки']]),
  section('3314', DAIRY, 'Масло, спреды, маргарин', [
    ['3776', 'dairy', 'Масло сливочное'],
    ['3761', 'dairy', 'Спреды'],
    ['4048', 'dairy', 'Маргарин'],
  ]),
  section('3249', DAIRY, 'Сыры весовые', [
    ['4248', 'dairy', 'Сыры твердые'],
    ['4278', 'dairy', 'Сыры рассольные'],
    ['4252', 'dairy', 'Сыры плавленые'],
  ]),
  section('3269', DAIRY, 'Сыры штучные', [
    ['3858', 'dairy', 'Сыры плавленые'],
    ['3808', 'dairy', 'Сыры рассольные'],
    ['3881', 'dairy', 'Сыры творожные'],
    ['3866', 'dairy', 'Сыры твердые'],
    ['4150', 'dairy', 'Сыры мягкие с плесенью'],
  ]),
  section('100014', DELI, 'Яйцо', [['3706', 'eggs', 'Яйцо']]),
  section('3136', BREAD, 'Хлеб', [
    ['3916', 'bread', 'Хлеб ржаной'],
    ['3937', 'bread', 'Хлеб белый'],
    ['4045', 'bread', 'Мелкоштучные изделия'],
    ['4080', 'bread', 'Батоны, багеты, лепешки, лаваш'],
  ]),
  section('3421', BREAD, 'Хлебобулочные изделия', [
    ['3753', 'bread', 'Лаваш'],
    ['4097', 'bread', 'Булочные сдобные изделия фасованные'],
  ]),
  section('3816', FROZEN, 'Птица замороженная', [
    ['3818', 'meat', 'Субпродукты из птицы замороженные'],
    ['4229', 'meat', 'Птица замороженная'],
  ]),
  section('3799', FROZEN, 'Мясные полуфабрикаты', [['4227', 'meat', 'Фарш']], ['3801', '3943', '4019']),
  section('100003', POULTRY, POULTRY, [['100021', 'meat', 'Мясо домашней птицы']]),
  section('4293', FRESH, FRESH, [
    ['4294', 'vegetables', 'Овощи'],
    ['4295', 'vegetables', 'Фрукты'],
    ['4298', 'vegetables', 'Зелень'],
  ], [], true),
  section('3150', GROCERY, 'Крупы, хлопья', [
    ['3724', 'groats', 'Крупы фасованные'],
    ['4258', 'groats', 'Крупы весовые'],
  ], ['3700']),
  section('3116', GROCERY, 'Мука', [['3754', 'groats', 'Мука фасованная']]),
  section('3094', GROCERY, 'Макароны фасованные', [['3736', 'groats', 'Макароны, жайма, лапша']]),
  section('3498', GROCERY, 'Макароны весовые', [['4276', 'groats', 'Макаронные изделия весовые']]),
  section('3374', GROCERY, 'Соль, сахар', [
    ['3785', 'sugar', 'Сахар рафинад'],
    ['4056', 'sugar', 'Сахар'],
    ['4131', 'sugar', 'Сахар прочий'],
    ['4302', 'sugar', 'Сахар весовой'],
    ['4073', 'salt', 'Соль'],
  ], ['4010']),
  section('3076', 'Масла и специи', 'Растительные масла', [
    ['3708', 'oil', 'Масло подсолнечное'],
    ['3749', 'oil', 'Масло оливковое'],
    ['3980', 'oil', 'Масло прочие'],
  ]),
  section('3091', 'Кофе и чай', 'Чай', [['3760', 'tea-coffee', 'Чай черный']], ['3832', '4057', '4187', '4242']),
  section('3618', FROZEN, 'Рыба замороженная', [
    ['4068', 'fish', 'Рыба замороженная'],
    ['4009', 'fish', 'Морепродукты замороженные'],
    ['4032', 'fish', 'Креветки'],
  ], ['4076', '4105']),
  section('3709', DELI, 'Рыба гастрономия', [
    ['3711', 'fish', 'Пресервы'],
    ['4024', 'fish', 'Рыба копченая'],
    ['4066', 'fish', 'Рыба соленая'],
    ['4193', 'fish', 'Рыба вяленая'],
  ], ['3846', '3969', '4142']),
]

export const FMART_SCOPE: readonly FmartLeaf[] = FMART_SECTIONS.flatMap(s => [...s.leaves.values()])

/** Section name as it stands in the category paths. */
export const fmartSectionName = (s: FmartSection): string => [...s.leaves.values()][0]?.path[1] ?? s.id
