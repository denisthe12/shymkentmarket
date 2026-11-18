import { PUBLISHED, SAME_ITEM_PRICES, SNAPSHOT, SRC, STORES } from '../../data'
import type { Post } from '../../types'

const fmt = (n: number) => n.toLocaleString('ru-RU')
const metroIdx = 3
const avg = (prices: number[]) => Math.round(prices.slice(0, 3).reduce((s, p) => s + p, 0) / 3)

export const post: Post = {
  slug: 'metro-koterme-satyp-alu',
  lang: 'kk',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'gulnara-ospanova',
  category: 'saving',
  needsSnapshot: true,
  title: 'METRO-дан көтерме сатып алу: отбасыға қашан тиімді',
  shortTitle: 'METRO-дан көтерме сатып алу',
  description: 'Шымкенттегі METRO-да азық-түлікті көтерме алу қай кезде отбасы бюджетін үнемдейді, ал қай кезде артық шығын мен ысырапқа айналады.',
  blocks: [
    {
      type: 'p',
      text: `**${STORES.metro}** бастапқыда кафе, дүкен және кеңселерге арналған, бірақ Шымкентте оған үлкен отбасылар да барады — әсіресе той, Наурыз алдында немесе бір айға азық алу үшін. Көтерме сатып алу неден үнемдейді, неден үнемдемейді — талдап көрейік.`,
    },
    { type: 'h2', text: 'Базалық тауарларда METRO қаншалық арзан' },
    {
      type: 'table',
      caption: `METRO және қалған үш желінің орташа бағасы, ₸ (${SNAPSHOT})`,
      head: ['Тауар', STORES.metro, 'Басқа желілер, орташа', 'Үнем'],
      rows: SAME_ITEM_PRICES.rows.map((r) => {
        const m = r.prices[metroIdx]
        const o = avg(r.prices)
        return [r.kk, fmt(m), fmt(o), `${Math.round(((o - m) / o) * 100)}%`]
      }),
    },
    { type: 'h2', text: 'Көтерме алуға не тиімді' },
    {
      type: 'ul',
      items: [
        '**Ұзақ сақталатын:** күріш, қант, ұн, макарон, май, шай, консерві.',
        '**Үлкен отбасында тез таусылатын:** жаялық, жуғыш заттар.',
        '**Мұздатуға ет** — мұздатқыш болса.',
      ],
    },
    { type: 'h2', text: 'Көтерме алмаған жөн' },
    {
      type: 'ul',
      items: [
        'Жаңа көкөніс пен жеміс — маусымда базарда арзанырақ.',
        'Мерзімі қысқа сүт өнімдері.',
        'Бұрын татып көрмеген жаңа тауарлар.',
      ],
    },
    { type: 'image', photo: 'bulk-goods' },
    { type: 'h2', text: 'Сапар өзін ақтай ма' },
    {
      type: 'ol',
      items: [
        'Бір айлық тізім жасап, [каталогтан](/kk/catalog) METRO-да шынымен арзан тауарларды белгілеңіз.',
        'Жол шығынын қосыңыз: такси немесе жанармай.',
        'Қаптаманың емес, келінің бағасын салыстырыңыз: [бағаны қалай оқу керек](/kk/blog/bagany-qalay-oqu-kerek).',
        'Туыстармен бөлісіңіз: бір қап күрішті екі отбасы алу — жиі тәжірибе.',
      ],
    },
    {
      type: 'callout',
      title: 'Ереже',
      text: 'Көтерме сатып алу тек барлығын мерзімі біткенше жеп үлгерсеңіз ғана үнемдейді. Лақтырылған өнім кез келген жеңілдіктен қымбат.',
    },
    { type: 'p', text: 'Тойға дайындалсаңыз — [той дастарханының бюджеті](/kk/blog/toi-dastarhany-byudzheti) мақаласын оқыңыз.' },
    { type: 'sources', items: [SRC.who, SRC.foodSafety] },
  ],
}
