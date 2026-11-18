import { CHEAPEST_WINS, PUBLISHED, SAME_ITEM_PRICES, SNAPSHOT, SRC, STORES } from '../../data'
import type { Post } from '../../types'

const fmt = (n: number) => n.toLocaleString('ru-RU')
const arbuzIdx = 0
const magnumIdx = 2

export const post: Post = {
  slug: 'arbuz-ili-magnum-go',
  lang: 'ru',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'timur-li',
  category: 'prices',
  needsSnapshot: true,
  title: 'Arbuz или Magnum Go: где выгоднее заказывать продукты в Шымкенте',
  shortTitle: 'Arbuz или Magnum Go',
  description: 'Сравниваем две онлайн-доставки продуктов в Шымкенте: цены на одинаковые товары, ассортимент и то, что влияет на итоговую сумму заказа.',
  blocks: [
    {
      type: 'p',
      text: `Онлайн-доставка продуктов в Шымкенте перестала быть экзотикой: заказ из приложения приезжает в тот же день, а в жару это часто удобнее, чем ехать в гипермаркет. Две заметные доставки — **${STORES.arbuz}** и **${STORES.magnumGo}**. Разбираем, где корзина обходится дешевле и от чего зависит итог.`,
    },
    { type: 'h2', text: 'Чем отличаются форматы' },
    {
      type: 'ul',
      items: [
        `**${STORES.arbuz}** — онлайн-супермаркет со своим складом: акцент на свежих продуктах, фермерских и готовых товарах.`,
        `**${STORES.magnumGo}** — онлайн-витрина сети Magnum: ассортимент ближе к обычному супермаркету, много собственных марок сети.`,
        'Условия доставки (стоимость, минимальная сумма, слоты) у обоих сервисов меняются — проверяйте их в приложении перед заказом.',
      ],
    },
    { type: 'h2', text: 'Сравнение цен на одинаковые товары' },
    {
      type: 'table',
      caption: `Одинаковые товары, ₸ (${SNAPSHOT})`,
      head: ['Товар', STORES.arbuz, STORES.magnumGo, 'Разница'],
      rows: SAME_ITEM_PRICES.rows.map((r) => {
        const a = r.prices[arbuzIdx]
        const m = r.prices[magnumIdx]
        return [r.ru, fmt(a), fmt(m), `${fmt(Math.abs(a - m))} ₸`]
      }),
    },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: 'Сколько раз сеть дешевле всех среди общих товаров, шт.',
        unit: 'count',
        bars: [
          { label: STORES.magnumGo, value: CHEAPEST_WINS.magnumGo.wins },
          { label: STORES.arbuz, value: CHEAPEST_WINS.arbuz.wins },
        ],
        source: `Shymkent Market, ${SNAPSHOT}`,
      },
    },
    { type: 'h2', text: 'Что ещё влияет на итоговую сумму' },
    {
      type: 'ol',
      items: [
        '**Стоимость доставки.** На небольшом заказе она может съесть всю разницу в ценах.',
        '**Минимальный заказ.** Если не дотягиваете, легко докинуть в корзину лишнее.',
        '**Замены.** Если товара нет, сборщик предложит замену — она бывает дороже. Отключайте автозамену для дорогих позиций.',
        '**Весовой товар.** Овощи, мясо и сыр взвешивают при сборке: итог может отличаться от суммы в корзине на 5–10%.',
      ],
    },
    { type: 'image', photo: 'grocery-delivery-bag' },
    { type: 'h2', text: 'Кому что подходит' },
    {
      type: 'p',
      text: `Если вы берёте в основном фасованные товары известных брендов, сравните корзину в обоих приложениях — разница по нашим данным бывает до **${CHEAPEST_WINS.medianSpreadPct}%**. Свежие овощи и фрукты в сезон часто выгоднее брать на базаре, об этом — [базар или супермаркет](/ru/blog/bazar-ili-supermarket-shymkent). Цены по каждому товару — в [каталоге](/ru/catalog).`,
    },
    {
      type: 'callout',
      title: 'Совет',
      text: 'Соберите одну и ту же корзину в двух приложениях и сравните сумму **вместе с доставкой** — это честнее, чем сравнивать отдельные ценники.',
    },
    { type: 'sources', items: [SRC.protectRights, SRC.statRegions] },
  ],
}
