import { ITEM_PRICES, PUBLISHED, SNAPSHOT, SRC } from '../../data'
import type { Post } from '../../types'

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')

/** Наурыз көже, 10 кесе: өнім, мөлшері (кг/л), бағасы (кг/л үшін) */
const items = [
  { name: 'Сиыр еті (сүрі немесе жас)', qty: 0.7, price: ITEM_PRICES.beef },
  { name: 'Тары', qty: 0.2, price: ITEM_PRICES.millet },
  { name: 'Күріш', qty: 0.2, price: ITEM_PRICES.rice },
  { name: 'Айран немесе қатық', qty: 1.5, price: ITEM_PRICES.ayran },
  { name: 'Сүт', qty: 1, price: ITEM_PRICES.milk },
  { name: 'Құрт', qty: 0.1, price: ITEM_PRICES.kurt },
]
const total = items.reduce((s, i) => s + i.qty * i.price, 0) + 150 // тұз, бидай, жүгері

export const post: Post = {
  slug: 'nauryz-kozhe-quny',
  lang: 'kk',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'dilnoza-rakhimova',
  category: 'prices',
  needsSnapshot: true,
  title: 'Наурыз көже құны: 10 кесеге қанша ақша кетеді',
  shortTitle: 'Наурыз көже құны',
  description: 'Шымкент желілерінің бағасымен Наурыз көженің 10 кесесін есептедік: жеті дәм үшін не алу керек, қайсысы ең қымбат және қалай үнемдеуге болады.',
  blocks: [
    {
      type: 'p',
      text: `Наурыз көже — жеті дәмнен тұратын мерекелік ас: су, ет, тұз, май, ұн немесе жарма, сүт немесе айран, тары немесе күріш. Шымкентте Наурызда көжені көршілерге, туыстарға үлестіреді, сондықтан әдетте үлкен қазанмен дайындайды. Біз 10 кесенің құнын ${SNAPSHOT} күнгі желі бағаларымен есептедік.`,
    },
    { type: 'h2', text: 'Құны неден құралады' },
    {
      type: 'table',
      caption: `Наурыз көже, 10 кесе, ₸ (${SNAPSHOT})`,
      head: ['Өнім', 'Мөлшері', 'Құны'],
      rows: [
        ...items.map((i) => [i.name, `${i.qty.toLocaleString('ru-RU')} кг/л`, fmt(i.qty * i.price)]),
        ['Тұз, бидай, жүгері', '—', '150'],
        ['Барлығы', '', fmt(total)],
        ['Бір кесе', '', fmt(total / 10)],
      ],
    },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: 'Көже құнындағы ең қымбат өнімдер, ₸',
        unit: '₸',
        bars: items
          .map((i) => ({ label: i.name, value: Math.round(i.qty * i.price) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 4),
        source: `Shymkent Market, желілердің орташа бағасы, ${SNAPSHOT}`,
      },
    },
    {
      type: 'p',
      text: `Шамамен **${fmt(total)} ₸** немесе **бір кесеге ${fmt(total / 10)} ₸** шығады. Құнның жартысынан көбі — ет.`,
    },
    { type: 'image', photo: 'soup-bowl' },
    { type: 'h2', text: 'Қалай үнемдеуге болады' },
    {
      type: 'ol',
      items: [
        'Ет ретінде сүйекті бөлікті алыңыз — көжеге дәм береді және арзанырақ. [Қой етін қалай таңдау керек](/kk/blog/qoy-eti-qalay-tandau).',
        'Айран мен қатықты үйде ашытуға болады — сүттен арзанға түседі.',
        'Тары мен күрішті қаппен алсаңыз, қалғаны басқа тағамға жарайды: [күріш таңдау](/kk/blog/kurish-tandau).',
        'Құртты базардан алыңыз — таңдау көп, татып көруге болады. [Құрт пен ірімшік](/kk/blog/qurt-pen-irimshik).',
      ],
    },
    {
      type: 'callout',
      title: 'Біз қалай есептедік',
      text: 'Желілердегі келі немесе литр бағасының медианасын және дәстүрлі рецепт бойынша мөлшерді алдық. Тұз бен бидайды бір сомамен бағаладық.',
    },
    { type: 'p', text: 'Желілердегі ет, сүт өнімдері мен жарма бағаларын [каталогтан](/kk/catalog) салыстырыңыз.' },
    { type: 'sources', items: [SRC.usda, SRC.statRegions] },
  ],
}
