import { BASKET, CHEAPEST_WINS, PUBLISHED, SAME_ITEM_PRICES, SNAPSHOT, SRC, STORES } from '../../data'
import type { Post } from '../../types'

const share = (w: { wins: number; presence: number }) => Math.round((w.wins / w.presence) * 1000) / 10
const fmt = (n: number) => n.toLocaleString('ru-RU')

export const post: Post = {
  slug: 'shymkentte-azyq-tulik-qaida-arzan',
  lang: 'kk',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'editorial',
  category: 'prices',
  needsSnapshot: true,
  title: 'Шымкентте азық-түлік қай жерде арзан: төрт желіні салыстырамыз',
  shortTitle: 'Шымкентте қай жерде арзан',
  description: 'Шымкенттегі төрт желідегі бірдей тауарларды салыстырдық: қай желі жиі арзан, бағалар қаншаға ажырасады және дүкенді қалай таңдау керек.',
  blocks: [
    {
      type: 'p',
      text: `Шымкентте азық-түлікті қайдан алуға таңдау көп: онлайн жеткізу, гипермаркеттер, көтерме METRO және үй жанындағы супермаркеттер. Біз **${STORES.arbuz}, ${STORES.gramad}, ${STORES.magnumGo} және ${STORES.metro}** желілерін салыстырдық. Тек **бірдей тауарларды** алдық: бір бренд, бір салмақ, әртүрлі баға.`,
    },
    { type: 'h2', text: 'Қай желі жиі арзан' },
    {
      type: 'p',
      text: `${SNAPSHOT} күнгі деректе кемінде екі желіде сатылатын ${fmt(CHEAPEST_WINS.total)} тауар табылды. Әр желі үшін оның бағасы ең төмен болған жағдайлардың үлесін есептедік.`,
    },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: 'Желі ең арзан болған ортақ тауарлар үлесі, %',
        unit: '%',
        bars: [
          { label: STORES.metro, value: share(CHEAPEST_WINS.metro) },
          { label: STORES.gramad, value: share(CHEAPEST_WINS.gramad) },
          { label: STORES.magnumGo, value: share(CHEAPEST_WINS.magnumGo) },
          { label: STORES.arbuz, value: share(CHEAPEST_WINS.arbuz) },
        ],
        source: `Shymkent Market, ${SNAPSHOT}`,
      },
    },
    { type: 'h2', text: 'Бір тауар — әртүрлі баға' },
    {
      type: 'table',
      caption: `Бірдей тауарлардың бағасы, ₸ (${SNAPSHOT})`,
      head: SAME_ITEM_PRICES.headKk,
      rows: SAME_ITEM_PRICES.rows.map((r) => [r.kk, ...r.prices.map(fmt)]),
    },
    { type: 'h2', text: 'Бір себет әр желіде қанша тұрады' },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: '6 бірдей тауар себеті, ₸',
        unit: '₸',
        bars: BASKET.map((b) => ({ label: b.store, value: b.total })),
        highlightMin: true,
        source: `Shymkent Market, ${SNAPSHOT}`,
      },
    },
    { type: 'image', photo: 'supermarket-shelves' },
    { type: 'h2', text: 'Дүкенді қалай таңдау керек' },
    {
      type: 'ol',
      items: [
        '«Бәрі арзан» желі болмайды. Апта сайын алатын **өз** 10–15 тауарыңыз қай жерде арзан екенін қараңыз.',
        'Жарма, қант, май және ұнды келі бағасы бойынша салыстырыңыз — [бағаны қалай оқу керек](/kk/blog/bagany-qalay-oqu-kerek).',
        'Жеткізуде оның құнын да есептеңіз: [онлайн жеткізу тиімді ме](/kk/blog/onlain-zhetkizu-tiimdi-me).',
        'Сатып алар алдында тауарды [каталогтан](/kk/catalog) ашыңыз — онда барлық желідегі баға көрінеді.',
      ],
    },
    {
      type: 'callout',
      title: 'Шектеулер',
      text: 'Біз желілер онлайн жариялайтын бағаларды және сәйкестендіре алған тауарларды ғана салыстырамыз. Нақты дүкендегі баға өзгеше болуы мүмкін.',
    },
    { type: 'sources', items: [SRC.statRegions, SRC.gramadWolt] },
  ],
}
