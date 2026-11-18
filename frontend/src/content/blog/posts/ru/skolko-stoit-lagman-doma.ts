import { ITEM_PRICES, PUBLISHED, SNAPSHOT, SRC } from '../../data'
import type { Post } from '../../types'

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')

/** Лагман на 4 порции: количество в кг/л и цена за кг/л */
const items = [
  { name: 'Говядина', qty: 0.5, price: ITEM_PRICES.beef },
  { name: 'Лапша для лагмана', qty: 0.5, price: ITEM_PRICES.noodles },
  { name: 'Перец болгарский', qty: 0.3, price: ITEM_PRICES.pepper },
  { name: 'Помидоры', qty: 0.4, price: ITEM_PRICES.tomato },
  { name: 'Лук', qty: 0.2, price: ITEM_PRICES.onion },
  { name: 'Морковь', qty: 0.2, price: ITEM_PRICES.carrot },
  { name: 'Картофель', qty: 0.3, price: ITEM_PRICES.potato },
  { name: 'Масло растительное', qty: 0.08, price: ITEM_PRICES.oil },
]
const total = items.reduce((s, i) => s + i.qty * i.price, 0) + 200 // + специи, чеснок, зелень

export const post: Post = {
  slug: 'skolko-stoit-lagman-doma',
  lang: 'ru',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'askar-mukhamedov',
  category: 'prices',
  needsSnapshot: true,
  title: 'Сколько стоит лагман дома в Шымкенте: расчёт на 4 порции',
  shortTitle: 'Лагман дома: расчёт',
  description: 'Посчитали стоимость домашнего лагмана на 4 порции по ценам сетей Шымкента и сравнили с кафе. Где можно сэкономить, не потеряв во вкусе.',
  blocks: [
    {
      type: 'p',
      text: `Лагман в Шымкенте едят почти так же часто, как плов. В кафе порция — заметная трата, а дома из тех же продуктов выходит семейный обед. Мы посчитали, во сколько обходится лагман на четверых по средним ценам сетей на ${SNAPSHOT}.`,
    },
    { type: 'h2', text: 'Из чего складывается цена' },
    {
      type: 'table',
      caption: `Лагман на 4 порции, ₸ (${SNAPSHOT})`,
      head: ['Продукт', 'Количество', 'Цена за кг/л', 'Стоимость'],
      rows: [
        ...items.map((i) => [i.name, `${i.qty.toLocaleString('ru-RU')} кг`, fmt(i.price), fmt(i.qty * i.price)]),
        ['Специи, чеснок, зелень', '—', '—', '200'],
        ['Итого', '', '', fmt(total)],
      ],
    },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: 'На что уходят деньги в лагмане, ₸',
        unit: '₸',
        bars: items
          .map((i) => ({ label: i.name, value: Math.round(i.qty * i.price) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5),
        source: `Shymkent Market, средние цены сетей, ${SNAPSHOT}`,
      },
    },
    {
      type: 'p',
      text: `Получается около **${fmt(total)} ₸** на четверых, или примерно **${fmt(total / 4)} ₸ за порцию**. Больше половины стоимости — мясо, поэтому именно на нём легче всего сэкономить.`,
    },
    { type: 'image', photo: 'noodles' },
    { type: 'h2', text: 'Как сделать лагман дешевле' },
    {
      type: 'ol',
      items: [
        '**Мясо.** Вместо вырезки берите лопатку или грудинку — для тушения они даже лучше. Что выбрать, мы разбирали в статье [баранина или говядина](/ru/blog/baranina-ili-govyadina).',
        '**Лапша.** Домашняя тянутая лапша из муки, воды и соли обходится в разы дешевле магазинной — нужна только сноровка.',
        '**Овощи по сезону.** Летом перец и помидоры дешёвые, зимой часть можно заменить томатной пастой. См. [помидоры и огурцы по сезону](/ru/blog/pomidory-i-ogurcy-sezonnost).',
        '**Большая кастрюля.** Соус-вадзы на два раза почти не добавляет к стоимости, а экономит время.',
      ],
    },
    { type: 'h2', text: 'Где сравнить цены на продукты' },
    {
      type: 'p',
      text: 'Цены на мясо, овощи и масло в разных сетях Шымкента — в [каталоге](/ru/catalog), например в разделах [мясо](/ru/collections/meat) и [овощи](/ru/collections/vegetables).',
    },
    {
      type: 'callout',
      title: 'Как мы считали',
      text: 'Брали среднюю цену за килограмм по сетям и количество продуктов по типовому рецепту. Специи, чеснок и зелень оценили одной суммой.',
    },
    { type: 'sources', items: [SRC.usda, SRC.statRegions] },
  ],
}
