import { CITIES_CPI_OCT, CPI_FOOD, CPI_MONTHS, CPI_TOTAL, PUBLISHED, SHYMKENT_CPI, SRC } from '../../data'
import type { Post } from '../../types'

const pct = (n: number) => `${n.toLocaleString('ru-RU')}%`
const lastShym = SHYMKENT_CPI.values.at(-1)!
const lastRk = CPI_TOTAL.at(-1)!

export const post: Post = {
  slug: 'inflyaciya-v-shymkente-2026',
  lang: 'ru',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'zhanar-abdikarimova',
  category: 'inflation',
  title: 'Инфляция в Шымкенте в 2026 году: цены растут медленнее, чем по стране',
  shortTitle: 'Инфляция в Шымкенте 2026',
  description: `Годовая инфляция в Шымкенте в октябре 2026 — ${pct(lastShym)} против ${pct(lastRk)} по Казахстану. Разбираем динамику по месяцам и что это значит для чека.`,
  blocks: [
    {
      type: 'p',
      text: `По данным Бюро национальной статистики, в октябре 2026 года цены в Шымкенте за год выросли на **${pct(lastShym)}**. Это ниже, чем в среднем по Казахстану (${pct(lastRk)}), в Алматы (${pct(CITIES_CPI_OCT.almaty)}) и в Астане (${pct(CITIES_CPI_OCT.astana)}). За один октябрь цены в городе прибавили ${pct(SHYMKENT_CPI.octMonth)}, а с начала года — ${pct(SHYMKENT_CPI.octYtd)}.`,
    },
    { type: 'h2', text: 'Как менялась инфляция в Шымкенте' },
    {
      type: 'p',
      text: 'БНС публикует региональные цифры в ежемесячных обзорах. Мы собрали месяцы, за которые есть данные по Шымкенту, и сравнили их с республикой.',
    },
    {
      type: 'chart',
      chart: {
        kind: 'line',
        title: 'Годовая инфляция: Шымкент и Казахстан, %',
        unit: '%',
        categories: SHYMKENT_CPI.months.map((i) => CPI_MONTHS.ru[i]),
        series: [
          { name: 'Шымкент', values: SHYMKENT_CPI.values },
          { name: 'Казахстан', values: SHYMKENT_CPI.months.map((i) => CPI_TOTAL[i]) },
        ],
        source: 'БНС АСПиР РК, 2026',
      },
    },
    {
      type: 'p',
      text: `Весной и летом Шымкент шёл вровень со страной или чуть выше: в марте — 10,8%, в августе — 10,4%. Перелом случился в сентябре: месячная инфляция в городе была **нулевой** (${pct(SHYMKENT_CPI.sepMonth)}), и годовой показатель сразу опустился до 8,7%.`,
    },
    { type: 'h2', text: 'Почему в сентябре цены замерли' },
    {
      type: 'ul',
      items: [
        '**Урожай.** Сентябрь — пик сезона овощей и фруктов в Туркестанской области. Помидоры, картофель, лук и дыни дешевеют, и это тянет вниз продуктовый индекс.',
        '**Высокая база.** Если год назад в сентябре цены росли быстро, то годовой показатель сейчас снижается, даже если ничего особенного не произошло.',
        '**Общее замедление.** По всей стране продовольственная инфляция снижается: с 12,9% в январе до 7,6% в октябре.',
      ],
    },
    {
      type: 'chart',
      chart: {
        kind: 'line',
        title: 'Казахстан: общая и продовольственная инфляция, %',
        unit: '%',
        categories: CPI_MONTHS.ru,
        series: [
          { name: 'Все товары и услуги', values: CPI_TOTAL },
          { name: 'Продукты', values: CPI_FOOD },
        ],
        source: 'БНС АСПиР РК, январь–октябрь 2026',
      },
    },
    { type: 'image', photo: 'receipt-calculator' },
    { type: 'h2', text: 'Что это значит для семейного бюджета' },
    {
      type: 'p',
      text: `Инфляция ${pct(lastShym)} — это средняя температура. Если ваша корзина — это в основном мясо, молочка и импортные продукты, ваша личная инфляция может быть выше. Если вы много покупаете сезонных овощей на базаре — ниже. Посчитать, сколько продуктов можно купить на минимальную зарплату, мы попробовали в статье [МЗП 2026 и продукты](/ru/blog/mzp-2026-i-produkty).`,
    },
    { type: 'h2', text: 'Что дальше' },
    {
      type: 'p',
      text: 'Зимой сезонный эффект уходит: овощи из теплиц и хранилищ дорожают, и месячная инфляция обычно ускоряется. На цены импорта влияет и курс — разбор в статье [курс тенге, сум и цены](/ru/blog/kurs-tenge-i-sum). Следить за ценами сетей можно на [дашборде](/ru/dashboard).',
    },
    { type: 'sources', items: [SRC.statRegions, SRC.nurOct, SRC.nurSep, SRC.nurAug, SRC.informOct] },
  ],
}
