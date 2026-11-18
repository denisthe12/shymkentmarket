import { ITEM_PRICES, MZP_2026, PUBLISHED, SNAPSHOT, SRC } from '../../data'
import type { Post } from '../../types'

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')

/** Недельная корзина семьи из 4 человек: количество (кг, л, десятки яиц) и цена за единицу */
const items = [
  { name: 'Мясо (говядина/баранина)', unit: 'кг', qty: 2, price: (ITEM_PRICES.beef + ITEM_PRICES.lamb) / 2 },
  { name: 'Курица', unit: 'кг', qty: 1.5, price: ITEM_PRICES.chicken },
  { name: 'Молоко', unit: 'л', qty: 5, price: ITEM_PRICES.milk },
  { name: 'Айран, кефир', unit: 'л', qty: 2, price: ITEM_PRICES.ayran },
  { name: 'Яйца', unit: '10 шт', qty: 2, price: ITEM_PRICES.eggs },
  { name: 'Рис', unit: 'кг', qty: 1.5, price: ITEM_PRICES.rice },
  { name: 'Мука', unit: 'кг', qty: 2, price: ITEM_PRICES.flour },
  { name: 'Картофель', unit: 'кг', qty: 3, price: ITEM_PRICES.potato },
  { name: 'Лук и морковь', unit: 'кг', qty: 3, price: (ITEM_PRICES.onion + ITEM_PRICES.carrot) / 2 },
  { name: 'Помидоры', unit: 'кг', qty: 2, price: ITEM_PRICES.tomato },
  { name: 'Масло растительное', unit: 'л', qty: 0.5, price: ITEM_PRICES.oil },
  { name: 'Сахар', unit: 'кг', qty: 0.5, price: ITEM_PRICES.sugar },
]
const total = items.reduce((s, i) => s + i.qty * i.price, 0)
const month = total * 4.3

export const post: Post = {
  slug: 'korzina-na-nedelyu-semya-shymkent',
  lang: 'ru',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'editorial',
  category: 'prices',
  needsSnapshot: true,
  title: 'Корзина на неделю для семьи из 4 человек в Шымкенте: сколько стоит',
  shortTitle: 'Корзина на неделю для семьи',
  description: 'Собрали базовую продуктовую корзину на неделю для семьи из четырёх человек по ценам сетей Шымкента и посчитали, сколько это в месяц.',
  blocks: [
    {
      type: 'p',
      text: `Сколько денег нужно семье из четырёх человек на продукты в Шымкенте? Мы собрали базовую корзину на неделю — без деликатесов, но с мясом, молочкой и овощами — и посчитали её по средним ценам сетей на ${SNAPSHOT}.`,
    },
    { type: 'h2', text: 'Что в корзине' },
    {
      type: 'table',
      caption: `Базовая корзина на неделю, семья из 4 человек, ₸ (${SNAPSHOT})`,
      head: ['Продукт', 'Количество', 'Стоимость'],
      rows: [
        ...items.map((i) => [i.name, `${i.qty.toLocaleString('ru-RU')} × ${i.unit}`, fmt(i.qty * i.price)]),
        ['Итого за неделю', '', fmt(total)],
      ],
    },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: 'Самые дорогие позиции корзины, ₸',
        unit: '₸',
        bars: items
          .map((i) => ({ label: i.name, value: Math.round(i.qty * i.price) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 6),
        source: `Shymkent Market, средние цены сетей, ${SNAPSHOT}`,
      },
    },
    { type: 'h2', text: 'Сколько это в месяц' },
    {
      type: 'p',
      text: `За месяц (4,3 недели) такая корзина обходится примерно в **${fmt(month)} ₸**. Для сравнения: минимальная зарплата в 2026 году — ${fmt(MZP_2026)} ₸. Подробнее о том, сколько продуктов можно купить на МЗП, — в статье [МЗП 2026 и продукты](/ru/blog/mzp-2026-i-produkty).`,
    },
    { type: 'image', photo: 'grocery-bags' },
    { type: 'h2', text: 'Чего в корзине нет' },
    {
      type: 'ul',
      items: [
        'Фруктов, сладостей, чая и напитков — их доля сильно зависит от привычек семьи.',
        'Хлеба и лепёшек — их обычно покупают каждый день, см. [лепёшка или хлеб](/ru/blog/lepeshka-i-hleb-shymkent).',
        'Бытовой химии и детского питания.',
      ],
    },
    { type: 'h2', text: 'Как удешевить корзину' },
    {
      type: 'ol',
      items: [
        'Мясо — самая большая статья. Часть блюд можно готовить на курице.',
        'Овощи летом выгоднее брать на базаре — см. [базар или супермаркет](/ru/blog/bazar-ili-supermarket-shymkent).',
        'Рис, муку и сахар — мешками раз в несколько месяцев: [когда это выгодно](/ru/blog/sahar-i-muka-meshkami).',
        'Сравнивайте сети по своему списку — где дешевле в целом, мы разбирали в статье [где дешевле продукты в Шымкенте](/ru/blog/gde-deshevle-produkty-shymkent).',
      ],
    },
    {
      type: 'callout',
      title: 'Как мы считали',
      text: 'Взяли медианные цены за килограмм или литр по сетям, которые сравнивает Shymkent Market. Количество — типовое потребление семьи из двух взрослых и двух детей.',
    },
    { type: 'sources', items: [SRC.mzp, SRC.statRegions] },
  ],
}
