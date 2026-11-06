import { CHEAPEST_WINS, PUBLISHED, SNAPSHOT, SRC, STORE_POINTS } from '../../data'
import type { Post } from '../../types'

const pct = (w: { wins: number; presence: number }) => Math.round((w.wins / w.presence) * 1000) / 10

export const post: Post = {
  slug: 'zhelilerdin-aiyrmashylygy',
  lang: 'kk',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'editorial',
  category: 'guides',
  title: 'Dina, Dana, Fix Price және Анвар: желілердің айырмашылығы',
  description: 'Қай желіде ассортимент кең, қайсысы жиі арзан, қайсысында акция көп. Ақтаудың төрт желісін біздің деректер бойынша салыстырдық.',
  blocks: [
    {
      type: 'p',
      text: `Біз Ақтаудың төрт желісінің бағасын бақылаймыз. Олардың әрқайсысының өз ерекшелігі бар: біреуінде ассортимент кең, біреуі жиі арзан, біреуі тек жекелеген тауарлар үшін тиімді. ${SNAPSHOT} күнгі деректер бойынша салыстырдық.`,
    },
    { type: 'h2', text: 'Ассортимент' },
    {
      type: 'chart',
      chart: {
        kind: 'bar',
        title: 'Біздің 9 санаттағы ұсыныстар саны',
        unit: 'count',
        bars: [
          { label: 'Dina Market', value: 1970 },
          { label: 'Анвар', value: 1598 },
          { label: 'Dana Market', value: 1147 },
          { label: 'Fix Price', value: 71 },
        ],
        source: `Aktau Market, ${SNAPSHOT}. Сүт, ашыған сүт өнімдері, нан, жұмыртқа, жарма, ет, май, қант, көкөніс`,
      },
    },
    {
      type: 'p',
      text: 'Dina-да ассортимент ең кең — әсіресе жарма мен сүт өнімдері. Fix Price негізінен азық-түлік емес тауарлар сататын дүкен: біздің санаттарда оның тауары аз, ет, май, қант және көкөніс мүлдем жоқ.',
    },
    { type: 'h2', text: 'Қай желі жиі арзан' },
    {
      type: 'table',
      caption: `Бірнеше желіде сатылатын ${CHEAPEST_WINS.total} тауар бойынша`,
      head: ['Желі', 'Ең арзан болған жағдай', 'Үлесі'],
      rows: [
        ['Анвар', `${CHEAPEST_WINS.anvar.wins} / ${CHEAPEST_WINS.anvar.presence}`, `${pct(CHEAPEST_WINS.anvar).toLocaleString('ru-RU')}%`],
        ['Dana Market', `${CHEAPEST_WINS.dana.wins} / ${CHEAPEST_WINS.dana.presence}`, `${pct(CHEAPEST_WINS.dana).toLocaleString('ru-RU')}%`],
        ['Dina Market', `${CHEAPEST_WINS.dina.wins} / ${CHEAPEST_WINS.dina.presence}`, `${pct(CHEAPEST_WINS.dina).toLocaleString('ru-RU')}%`],
      ],
    },
    {
      type: 'p',
      text: 'Анвар ортақ тауарлардың төрттен үшінде ең арзан. Бірақ бұл барлық тауар Анварда арзан дегенді білдірмейді: мысалы, күріш Fix Price-та, йогурт пен «Доширак» Dina-да арзанырақ болды.',
    },
    { type: 'image', photo: 'supermarket-cart' },
    { type: 'h2', text: 'Әр желінің ерекшелігі' },
    {
      type: 'ul',
      items: [
        `**Dina Market** — ${STORE_POINTS.dina} дүкен, ассортимент ең кең, өз нан өнімдері бар («Дина» наны).`,
        `**Анвар** — ${STORE_POINTS.anvar} дүкен, жиі ең арзан, өз маркасы көп (макарон, күріш, қант, май), акциялар жиі.`,
        `**Dana Market** — ${STORE_POINTS.dana} дүкен, бағасы орташа, кейбір тауарлар (мысалы, кейбір ұн мен бұршақ) ең арзан.`,
        `**Fix Price** — ${STORE_POINTS.fix} дүкен, азық-түлік аз, бірақ кейбір позициялар (күріш 800 г — 399 ₸) өте арзан.`,
      ],
    },
    {
      type: 'callout',
      title: 'Қорытынды',
      text: 'Барлық тауарға бір «ең арзан желі» жоқ. Ең тиімді тәсіл — негізгі сатып алуды бір желіде жасап, кейбір тауарларды басқа желіден алу. Толығырақ: [«Ақтау желілеріндегі акциялар»](/kk/blog/akciyalar-men-zhenildikter).',
    },
    { type: 'sources', items: [SRC.aktau] },
  ],
}
