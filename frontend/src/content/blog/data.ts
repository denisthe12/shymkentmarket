// Цифры для статей — в одном месте, чтобы ru и kk версии не разошлись.
//
// ⚠️ ЦЕНЫ СЕТЕЙ — ЗАГЛУШКИ. Снимка цен сетей Шымкента ещё нет: всё, что помечено TODO(snapshot),
// заменить на данные api Shymkent Market, затем поставить PRICES_ARE_PLACEHOLDER = false и обновить
// SNAPSHOT. Пока флаг true, статьи с needsSnapshot закрыты от индексации и показывают пометку.
//
// Официальная статистика — настоящая: Бюро национальной статистики (stat.gov.kz), Нацбанк, законы о МЗП/МРП.

import type { Post } from './types'

/** TODO(snapshot): false, когда цены ниже заменены на настоящий снимок */
export const PRICES_ARE_PLACEHOLDER = true

/** Статья видна поисковикам: либо не зависит от цен сетей, либо цены уже настоящие */
export const isIndexable = (post: Pick<Post, 'needsSnapshot'>) => !(post.needsSnapshot && PRICES_ARE_PLACEHOLDER)

/** TODO(snapshot): дата снимка цен сетей */
export const SNAPSHOT = '18.11.2026'
/** Дата, на которую сверены цифры в статьях (post.updated) */
export const PUBLISHED = '2026-11-18'

export const STORES = { arbuz: 'Arbuz', gramad: 'GraMad', magnumGo: 'Magnum Go', metro: 'METRO' } as const

/** TODO(snapshot): корзина из 6 одинаковых позиций (молоко 1 л, рис 1 кг, яйца 10 шт, масло 1 л, сахар 1 кг, мука 2 кг) */
export const BASKET = [
  { store: STORES.metro, total: 4890 },
  { store: STORES.gramad, total: 5210 },
  { store: STORES.magnumGo, total: 5340 },
  { store: STORES.arbuz, total: 5620 },
]

/** TODO(snapshot): товары в 2+ сетях — сколько раз сеть дешевле всех / сколько раз товар в ней есть */
export const CHEAPEST_WINS = {
  total: 500,
  metro: { wins: 180, presence: 320 },
  gramad: { wins: 140, presence: 380 },
  magnumGo: { wins: 120, presence: 420 },
  arbuz: { wins: 80, presence: 400 },
  medianSpreadPct: 10,
  shareOver20Pct: 25,
}

/** TODO(snapshot): одинаковые товары в разных сетях, ₸ */
export const SAME_ITEM_PRICES = {
  head: ['Товар', STORES.arbuz, STORES.gramad, STORES.magnumGo, STORES.metro],
  headKk: ['Тауар', STORES.arbuz, STORES.gramad, STORES.magnumGo, STORES.metro],
  rows: [
    { ru: 'Молоко 3,2% 1 л', kk: 'Сүт 3,2% 1 л', prices: [650, 610, 620, 590] },
    { ru: 'Рис 1 кг', kk: 'Күріш 1 кг', prices: [890, 820, 850, 790] },
    { ru: 'Яйца С1, 10 шт', kk: 'Жұмыртқа С1, 10 дана', prices: [990, 940, 960, 900] },
    { ru: 'Масло подсолнечное 1 л', kk: 'Күнбағыс майы 1 л', prices: [1150, 1090, 1120, 1040] },
    { ru: 'Сахар 1 кг', kk: 'Қант 1 кг', prices: [560, 520, 540, 500] },
  ],
}

/**
 * TODO(snapshot): средние цены продуктов для расчёта блюд и корзин, ₸ за кг / л / 10 шт.
 * Брать медиану по сетям из снимка
 */
export const ITEM_PRICES = {
  lamb: 4800,
  beef: 4200,
  chicken: 1900,
  rice: 850,
  carrot: 250,
  onion: 200,
  potato: 230,
  tomato: 700,
  pepper: 900,
  flour: 330,
  oil: 1100,
  eggs: 950,
  milk: 620,
  noodles: 900,
  sugar: 530,
  millet: 450,
  kurt: 3500,
  ayran: 450,
  pumpkin: 250,
  tea: 3800,
}

/** TODO(snapshot): предложения с зачёркнутой старой ценой, по сетям */
export const DISCOUNTS = { offers: 5000, discounted: 600, medianPct: 15 }

// ---------- Официальная статистика ----------

export const CPI_MONTHS = {
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт'],
  kk: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз'],
}
/** Годовая инфляция по Казахстану, январь–октябрь 2026, % */
export const CPI_TOTAL = [12.2, 11.7, 11.0, 10.6, 10.4, 10.3, 10.2, 9.8, 9.3, 9.2]
/** Годовой рост цен на продовольственные товары по Казахстану, январь–октябрь 2026, % */
export const CPI_FOOD = [12.9, 12.7, 11.7, 11.3, 10.7, 10.4, 10.1, 9.5, 8.5, 7.6]

/**
 * Годовая инфляция в г. Шымкент (БНС публикует в региональных обзорах; есть не за каждый месяц).
 * months — индексы в CPI_MONTHS
 */
export const SHYMKENT_CPI = {
  months: [2, 3, 5, 7, 8, 9],
  values: [10.8, 10.4, 10.3, 10.4, 8.7, 8.8],
  /** Октябрь 2026: за месяц и с начала года */
  octMonth: 0.8,
  octYtd: 7.8,
  /** Сентябрь 2026: за месяц */
  sepMonth: 0.0,
}
/** Инфляция в Астане и Алматы в октябре 2026 — для сравнения */
export const CITIES_CPI_OCT = { astana: 10.0, almaty: 9.2 }

/** Население г. Шымкент, 2026 (БНС) */
export const SHYMKENT_POPULATION = 1308120

export const BASE_RATE = { value: 15.75, date: '23.10.2026', next: '04.12.2026', prev: 16.25 }
export const USD_RATE = { value: 453.64, date: '03.11.2026' }
/** Официальный курс НБРК: тенге за 1000 узбекских сумов */
export const UZS_RATE = { per1000: 38.5, date: '07.10.2026' }
export const MRP_2026 = 4325
export const MZP_2026 = 85000
export const SUBSISTENCE_2026 = 50851
/** Минимальная базовая пенсия 2026 — 70% прожиточного минимума */
export const MIN_BASE_PENSION_2026 = 35596

/** Ссылки на источники */
export const SRC = {
  statPrices: { title: 'Бюро национальной статистики: инфляция в РК', url: 'https://stat.gov.kz/ru/industries/economy/prices/' },
  statRegions: { title: 'БНС: статистика регионов — инфляция', url: 'https://stat.gov.kz/ru/region/?param=INFLATION' },
  statShymkent: { title: 'БНС: статистика г. Шымкент', url: 'https://stat.gov.kz/ru/region/shymkent/' },
  nurOct: { title: 'NUR.kz: рост цен на товары и услуги замедлился (октябрь 2026)', url: 'https://www.nur.kz/nurfin/economy/2450841-rost-cen-na-tovary-i-uslugi-zamedlilsya-v-kazahstane/' },
  nurSep: { title: 'NUR.kz: рост цен продолжает замедляться (сентябрь 2026)', url: 'https://www.nur.kz/nurfin/economy/2437042-rost-cen-prodolzhaet-zamedlyatsya-v-kazahstane/' },
  nurAug: { title: 'NUR.kz: где в Казахстане сильнее всего выросли цены (август 2026)', url: 'https://www.nur.kz/nurfin/economy/2421306-gde-v-kazahstane-silnee-vsego-vyrosli-ceny-na-tovary-i-uslugi/' },
  informOct: { title: 'Kazinform: инфляция в Казахстане замедлилась до 9,2%', url: 'https://www.inform.kz/ru/inflyatsiya-v-kazahstane-zamedlilas-do-92-8065a968' },
  halykOct: { title: 'Halyk Finance: годовая инфляция продолжает замедляться', url: 'https://halykfinance.kz/analiticheskiy-tsentr/godovaya-inflyatsiya-v-kazahstane-prodolzhaet-zamedlyatsya.html' },
  nbkRate: { title: 'Национальный банк РК: базовая ставка', url: 'https://nationalbank.kz/ru/news/bazovaya-stavka' },
  usdRate: { title: 'Mybuh.kz: курсы валют на 3 ноября 2026 г.', url: 'https://mybuh.kz/news/kursy-valyut-na-3-noyabrya-2026-g/' },
  uzsRate: { title: 'Informburo: курс узбекского сума к тенге (НБРК)', url: 'https://informburo.kz/kurs-valyut/pair/uzs-kzt' },
  mrp: { title: 'Tengrinews: МРП на 2026 год', url: 'https://tengrinews.kz/kazakhstan_news/utverjden-novyiy-mrp-na-2026-god-v-kazahstane-586608/' },
  mzp: { title: 'Inbusiness.kz: размеры МЗП и МРП на 2026 год', url: 'https://inbusiness.kz/ru/last/kakie-razmery-mzp-i-mrp-na-2026-god-utverdili-na-2026-god-v-kazahstane' },
  pension: { title: 'Inbusiness.kz: новый МРП, пенсии и пособия с 2026 года', url: 'https://www.inbusiness.kz/ru/last/novyj-mrp-pensii-i-posobiya-kak-obnovyat-socvyplaty-s-2026-goda' },
  population: { title: '24.kz: численность населения Казахстана превысила 20,5 млн', url: 'https://24.kz/ru/news/social/777639-chislennost-naseleniya-kazakhstana-prevysila-20-5-milliona-chelovek' },
  szptLaw: { title: 'Перечень социально значимых продовольственных товаров (zakon.uchet.kz)', url: 'https://zakon.uchet.kz/rus/docs/V2300032474' },
  usda: { title: 'USDA FoodData Central — состав продуктов', url: 'https://fdc.nal.usda.gov/' },
  who: { title: 'ВОЗ: здоровое питание (информационный бюллетень)', url: 'https://www.who.int/ru/news-room/fact-sheets/detail/healthy-diet' },
  foodSafety: { title: 'ВОЗ: пять принципов безопасности пищевых продуктов', url: 'https://www.who.int/ru/news-room/fact-sheets/detail/food-safety' },
  gramadWolt: { title: 'Wolt: магазины GraMad в Шымкенте', url: 'https://wolt.com/ru/kaz/shymkent/brand/gramad' },
  gramad2gis: { title: '2ГИС: супермаркет GraMad, Шымкент', url: 'https://2gis.kz/shymkent/firm/70000001091444488' },
  protectRights: { title: 'Закон РК «О защите прав потребителей» (adilet.zan.kz)', url: 'https://adilet.zan.kz/rus/docs/Z100000274_' },
}
