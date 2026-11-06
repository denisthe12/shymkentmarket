// Цифры для статей — в одном месте, чтобы ru и kk версии не разошлись.
// Цены — снимок api.aktau.market от 06.11.2026 (4 сети, 4209 товаров).
// Инфляция — релизы Бюро национальной статистики (stat.gov.kz), годовая, % к тому же месяцу прошлого года

export const SNAPSHOT = '06.11.2026'
export const PUBLISHED = '2026-11-06'

export const STORES = { dina: 'Dina Market', dana: 'Dana Market', fix: 'Fix Price', anvar: 'Анвар' } as const

/** Корзина из 5 одинаковых позиций (молоко 1 л, макароны 400 г, рис 800 г, йогурт Fruttis 115 г, Доширак 120 г) */
export const BASKET = [
  { store: STORES.anvar, total: 1693 },
  { store: STORES.dina, total: 1734 },
  { store: STORES.fix, total: 2062 },
  { store: STORES.dana, total: 2149 },
]

/** Товары, что продаются в 2+ сетях: сколько раз сеть дешевле всех / сколько раз товар в ней есть */
export const CHEAPEST_WINS = {
  total: 492,
  anvar: { wins: 262, presence: 340 },
  dana: { wins: 148, presence: 293 },
  dina: { wins: 89, presence: 433 },
  fix: { wins: 2, presence: 3 },
  medianSpreadPct: 9.7,
  p75SpreadPct: 21.8,
  shareOver20Pct: 26.8,
}

/** Акции: предложения с зачёркнутой старой ценой */
export const DISCOUNTS = { offers: 4786, discounted: 543, medianPct: 16.7, dina: 124, anvar: 413, fix: 6, dana: 0 }

export const CPI_MONTHS = {
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт'],
  kk: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз'],
}
/** Годовая инфляция по Казахстану, январь–октябрь 2026 */
export const CPI_TOTAL = [12.2, 11.7, 11.0, 10.6, 10.4, 10.3, 10.2, 9.8, 9.3, 9.2]
/** Годовой рост цен на продовольственные товары, январь–октябрь 2026 */
export const CPI_FOOD = [12.9, 12.7, 11.7, 11.3, 10.7, 10.4, 10.1, 9.5, 8.5, 7.6]

/** Годовая инфляция в Мангистауской области (есть не за каждый месяц) */
export const MANGYSTAU_CPI = { mar: 12.0, jun: 11.2, aug: 9.5, oct: 7.7 }

export const BASE_RATE = { value: 15.75, date: '23.10.2026', next: '04.12.2026', low: 14.75, high: 16.75, prev: 16.25 }
/** Минимальная базовая пенсия 2026 — 70% прожиточного минимума */
export const MIN_BASE_PENSION_2026 = 35596

/** Сети: магазины на карте Aktau Market (дашборд) */
export const STORE_POINTS = { dina: 5, dana: 5, fix: 5, anvar: 3 }

/** Предложения со скидкой по категориям: доля и медианная скидка, % */
export const DISCOUNTS_BY_CATEGORY = [
  { slug: 'groats', share: 15.8, median: 19.8 },
  { slug: 'oil', share: 15.5, median: 22.0 },
  { slug: 'milk', share: 14.9, median: 12.0 },
  { slug: 'vegetables', share: 9.6, median: 20.5 },
  { slug: 'dairy', share: 8.8, median: 15.1 },
  { slug: 'sugar', share: 3.9, median: 10.1 },
  { slug: 'bread', share: 3.7, median: 13.5 },
  { slug: 'meat', share: 2.0, median: 6.1 },
  { slug: 'eggs', share: 0, median: 0 },
]
export const USD_RATE = { value: 453.64, date: '03.11.2026' }
export const MRP_2026 = 4325
export const MZP_2026 = 85000
export const SUBSISTENCE_2026 = 50851

/** Ссылки на источники */
export const SRC = {
  statOct: { title: 'Бюро национальной статистики: инфляция в РК', url: 'https://stat.gov.kz/ru/industries/economy/prices/' },
  statAug: { title: 'БНС: Инфляция в Республике Казахстан (август 2026 г.)', url: 'https://stat.gov.kz/ru/industries/economy/prices/publications/347964/' },
  statJun: { title: 'БНС: Инфляция в Республике Казахстан (июнь 2026 г.)', url: 'https://stat.gov.kz/ru/industries/economy/prices/publications/347710/' },
  statMar: { title: 'БНС: Инфляция в Республике Казахстан (март 2026 г.)', url: 'https://stat.gov.kz/ru/industries/economy/prices/publications/480322/' },
  statMangystau: { title: 'БНС: статистика Мангистауской области', url: 'https://stat.gov.kz/ru/region/mangystau/' },
  tengeOct: { title: 'The Tenge: инфляция замедлилась до 9,2% в октябре 2026', url: 'https://the-tenge.kz/articles/inflyatsiya-zamedlilas-po-itogam-oktyabrya' },
  kursivOct: { title: 'Kursiv: инфляция продолжила снижаться в октябре', url: 'https://kz.kursiv.media/2026-11-02/zhnb-inflyacziya-prodolzhila-snizhatsya-v-kazahstane-v-oktyabre/' },
  halykOct: { title: 'Halyk Finance: годовая инфляция продолжает замедляться', url: 'https://halykfinance.kz/analiticheskiy-tsentr/godovaya-inflyatsiya-v-kazahstane-prodolzhaet-zamedlyatsya.html' },
  nbkRate: { title: 'Национальный банк РК: базовая ставка', url: 'https://nationalbank.kz/ru/news/bazovaya-stavka' },
  nbkRateNews: { title: 'Moscow Times / Reuters: Нацбанк снизил ставку до 15,75%', url: 'https://ru.themoscowtimes.com/2026/10/23/natsbank-kazakhstana-snizil-bazovuyu-stavku-do-1575-a209372' },
  usdRate: { title: 'Mybuh.kz: курсы валют на 3 ноября 2026 г.', url: 'https://mybuh.kz/news/kursy-valyut-na-3-noyabrya-2026-g/' },
  szpt: { title: 'Forbes.kz: список социально значимых продуктов расширили', url: 'https://forbes.kz/articles/vkazahstane-rasshirili-spisok-sotsialno-znachimyh-produktov' },
  szptLaw: { title: 'Перечень социально значимых продовольственных товаров (zakon.uchet.kz)', url: 'https://zakon.uchet.kz/rus/docs/V2300032474' },
  mrp: { title: 'Tengrinews: МРП на 2026 год', url: 'https://tengrinews.kz/kazakhstan_news/utverjden-novyiy-mrp-na-2026-god-v-kazahstane-586608/' },
  aktau: { title: 'Aktau Market: снимок цен сетей Актау от 06.11.2026', url: 'https://aktau.market/ru/dashboard' },
  pension: { title: 'Inbusiness.kz: новый МРП, пенсии и пособия с 2026 года', url: 'https://www.inbusiness.kz/ru/last/novyj-mrp-pensii-i-posobiya-kak-obnovyat-socvyplaty-s-2026-goda' },
  mzp: { title: 'Inbusiness.kz: размеры МЗП и МРП на 2026 год', url: 'https://inbusiness.kz/ru/last/kakie-razmery-mzp-i-mrp-na-2026-god-utverdili-na-2026-god-v-kazahstane' },
  usda: { title: 'USDA FoodData Central — состав продуктов', url: 'https://fdc.nal.usda.gov/' },
  nbkDecision: { title: 'Zakon.kz: решение Нацбанка по базовой ставке 23.10.2026', url: 'https://www.zakon.kz/finansy/6536050-novoe-reshenie-po-bazovoy-stavke-obyavil-natsbank-kazakhstana.html' },
  regions: { title: 'Zakon.kz: самые дорогие и самые дешёвые регионы Казахстана', url: 'https://www.zakon.kz/finansy/6537302-nazvany-samye-dorogie-i-samye-deshevye-goroda-kazakhstana.html' },
}
