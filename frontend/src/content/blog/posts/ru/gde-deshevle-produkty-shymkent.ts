import { BASKET, CHEAPEST_WINS, PUBLISHED, SAME_ITEM_PRICES, SNAPSHOT, SRC, STORES } from '../../data'
import type { Post } from '../../types'

const share = (w: { wins: number; presence: number }) => Math.round((w.wins / w.presence) * 1000) / 10
const fmt = (n: number) => n.toLocaleString('ru-RU')

export const post: Post = {
  slug: 'gde-deshevle-produkty-shymkent',
  lang: 'ru',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'editorial',
  category: 'prices',
  needsSnapshot: true,
  title: 'Где дешевле продукты в Шымкенте: Arbuz, GraMad, Magnum Go и METRO',
  shortTitle: 'Где дешевле продукты в Шымкенте',
  description: 'Сравниваем одинаковые товары в четырёх сетях Шымкента: кто чаще дешевле, насколько расходятся цены и как выбрать магазин под свой список.',
  blocks: [
    {
      type: 'p',
      text: `В Шымкенте больше миллиона жителей, и выбор, где покупать продукты, у них широкий: онлайн-доставка, гипермаркеты у трасс, оптовый METRO и супермаркеты у дома. Мы сравнили четыре сети, которые публикуют цены онлайн, — **${STORES.arbuz}, ${STORES.gramad}, ${STORES.magnumGo} и ${STORES.metro}**. Сравнивали только **одинаковые товары**: тот же бренд, тот же вес, разные ценники.`,
    },
    { type: 'h2', text: 'Почему «средняя цена по сети» ничего не говорит' },
    {
      type: 'p',
      text: 'У каждой сети свой ассортимент. Если в одной больше премиальных сыров, а в другой — крупы в мешках, средний чек будет разным, даже если на одинаковые товары цены близки. Поэтому мы смотрим только на пары «тот же товар — разные магазины».',
    },
    { type: 'h2', text: 'Какая сеть чаще дешевле' },
    {
      type: 'p',
      text: `В снимке на ${SNAPSHOT} нашлось ${fmt(CHEAPEST_WINS.total)} товаров, которые продаются хотя бы в двух сетях. Затем для каждой сети проверили, как часто именно её ценник был минимальным среди всех магазинов, где этот товар есть.`,
    },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: 'Доля общих товаров, где сеть дешевле всех, %',
        unit: '%',
        bars: [
          { label: STORES.metro, value: share(CHEAPEST_WINS.metro) },
          { label: STORES.gramad, value: share(CHEAPEST_WINS.gramad) },
          { label: STORES.magnumGo, value: share(CHEAPEST_WINS.magnumGo) },
          { label: STORES.arbuz, value: share(CHEAPEST_WINS.arbuz) },
        ],
        source: `Shymkent Market, ${fmt(CHEAPEST_WINS.total)} товаров в 2+ сетях, ${SNAPSHOT}`,
      },
    },
    {
      type: 'p',
      text: `Медианный разрыв между дешёвым и дорогим вариантом одного товара — **${CHEAPEST_WINS.medianSpreadPct}%**, а примерно на каждой четвёртой позиции он превышает 20%. На недельной корзине это уже заметные деньги.`,
    },
    { type: 'h2', text: 'Один и тот же товар — разные цены' },
    {
      type: 'table',
      caption: `Цены на одинаковые товары, ₸ (${SNAPSHOT})`,
      head: SAME_ITEM_PRICES.head,
      rows: SAME_ITEM_PRICES.rows.map((r) => [r.ru, ...r.prices.map(fmt)]),
    },
    { type: 'h2', text: 'Сколько стоит одна корзина в каждой сети' },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: 'Корзина из 6 одинаковых товаров, ₸',
        unit: '₸',
        bars: BASKET.map((b) => ({ label: b.store, value: b.total })),
        highlightMin: true,
        source: `Shymkent Market, ${SNAPSHOT}`,
      },
    },
    { type: 'image', photo: 'shopping-cart-aisle' },
    { type: 'h2', text: 'Как выбрать магазин под свой список' },
    {
      type: 'ol',
      items: [
        'Самой дешёвой сети «на всё» не бывает. Смотрите, где дешевле **ваши** 10–15 товаров, которые вы берёте каждую неделю.',
        'Крупы, сахар, масло и муку выгодно сравнивать по цене за килограмм — об этом наш разбор [цены за кг в доставке и в зале](/ru/blog/cena-za-kg-dostavka-i-zal).',
        'В доставке учитывайте стоимость самой доставки и минимальную сумму заказа: см. [как экономить на доставке](/ru/blog/kak-ekonomit-na-dostavke-produktov).',
        'Перед покупкой откройте товар в [каталоге](/ru/catalog) — там видны цены во всех сетях сразу.',
      ],
    },
    {
      type: 'callout',
      title: 'Ограничения',
      text: 'В расчёт попали только онлайн-цены сетей и только позиции, для которых нашлась точная пара в другой сети. На полке конкретного магазина цена бывает иной, а акции обновляются еженедельно.',
    },
    { type: 'sources', items: [SRC.statRegions, SRC.gramadWolt] },
  ],
}
