import { ITEM_PRICES, PUBLISHED, SNAPSHOT, SRC } from '../../data'
import type { Post } from '../../types'

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')

/** Студенттің апталық себеті: өнім, мөлшері, бірлік бағасы */
const items = [
  { name: 'Күріш', unit: 'кг', qty: 1, price: ITEM_PRICES.rice },
  { name: 'Макарон / кеспе', unit: 'кг', qty: 1, price: ITEM_PRICES.noodles },
  { name: 'Жұмыртқа', unit: '10 дана', qty: 1, price: ITEM_PRICES.eggs },
  { name: 'Тауық еті', unit: 'кг', qty: 1, price: ITEM_PRICES.chicken },
  { name: 'Сүт', unit: 'л', qty: 2, price: ITEM_PRICES.milk },
  { name: 'Картоп', unit: 'кг', qty: 2, price: ITEM_PRICES.potato },
  { name: 'Пияз, сәбіз', unit: 'кг', qty: 1, price: (ITEM_PRICES.onion + ITEM_PRICES.carrot) / 2 },
  { name: 'Өсімдік майы', unit: 'л', qty: 0.25, price: ITEM_PRICES.oil },
]
const total = items.reduce((s, i) => s + i.qty * i.price, 0)

export const post: Post = {
  slug: 'studenttin-aptalyq-byudzheti',
  lang: 'kk',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'madina-seitzhanova',
  category: 'saving',
  needsSnapshot: true,
  title: 'Студенттің апталық азық бюджеті: Шымкентте аз ақшаға қалай тамақтануға болады',
  shortTitle: 'Студенттің апталық бюджеті',
  description: 'Шымкенттегі студентке арналған апталық азық-түлік себеті желі бағаларымен: не алу керек, қанша тұрады және жатақханада қалай үнемдеуге болады.',
  blocks: [
    {
      type: 'p',
      text: `Шымкентте ондаған мың студент оқиды, көбі облыстан келген және жатақханада немесе жалдамалы пәтерде тұрады. Шәкіртақы мен үйден келетін ақшаға тамақтану — нағыз өнер. Біз ${SNAPSHOT} күнгі желі бағаларымен бір аптаға қарапайым себет құрастырдық.`,
    },
    { type: 'h2', text: 'Апталық себет' },
    {
      type: 'table',
      caption: `Бір студентке апталық себет, ₸ (${SNAPSHOT})`,
      head: ['Өнім', 'Мөлшері', 'Құны'],
      rows: [
        ...items.map((i) => [i.name, `${i.qty.toLocaleString('ru-RU')} × ${i.unit}`, fmt(i.qty * i.price)]),
        ['Барлығы', '', fmt(total)],
      ],
    },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: 'Себеттегі ең қымбат өнімдер, ₸',
        unit: '₸',
        bars: items
          .map((i) => ({ label: i.name, value: Math.round(i.qty * i.price) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5),
        source: `Shymkent Market, желілердің орташа бағасы, ${SNAPSHOT}`,
      },
    },
    {
      type: 'p',
      text: `Аптасына шамамен **${fmt(total)} ₸**, айына — **${fmt(total * 4.3)} ₸** шығады. Нан, шай, жеміс бұл есепке кірмеген.`,
    },
    { type: 'image', photo: 'student-cooking' },
    { type: 'h2', text: 'Не дайындауға болады' },
    {
      type: 'ul',
      items: [
        'Тауық еті мен күріштен — палау немесе қуырылған күріш.',
        'Картоп пен пияздан — қуырдақ, сорпа.',
        'Жұмыртқадан — таңғы асқа омлет, жұмыртқалы кеспе.',
        'Макароннан — тауық етімен немесе көкөніспен.',
      ],
    },
    { type: 'h2', text: 'Үнемдеудің кеңестері' },
    {
      type: 'ol',
      items: [
        'Бөлмелестермен бірге алыңыз: күріш, май, қант — үлкен қаптамада арзан.',
        'Көкөністі базардан, әсіресе маусымда алыңыз: [көкөніс базары мен желілер](/kk/blog/kokonis-bazary-men-zheliler).',
        'Келі бағасын салыстырыңыз: [бағаны қалай оқу керек](/kk/blog/bagany-qalay-oqu-kerek).',
        'Кафеде күнде тамақтанбаңыз: үйде пісірген бір тағамның құны кафедегі бір порциядан бірнеше есе төмен.',
      ],
    },
    {
      type: 'callout',
      text: 'Жұмыртқа — ең арзан ақуыз көздерінің бірі. Оны қай жерден алған тиімді — [жұмыртқа: дүкен мен базар](/kk/blog/zhumyrtqa-dukende-men-bazarda).',
    },
    { type: 'sources', items: [SRC.who, SRC.usda] },
  ],
}
