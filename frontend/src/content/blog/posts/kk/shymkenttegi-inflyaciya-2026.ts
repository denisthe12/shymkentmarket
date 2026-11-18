import { CITIES_CPI_OCT, CPI_MONTHS, CPI_TOTAL, PUBLISHED, SHYMKENT_CPI, SRC } from '../../data'
import type { Post } from '../../types'

const pct = (n: number) => `${n.toLocaleString('ru-RU')}%`
const lastShym = SHYMKENT_CPI.values.at(-1)!
const lastRk = CPI_TOTAL.at(-1)!

export const post: Post = {
  slug: 'shymkenttegi-inflyaciya-2026',
  lang: 'kk',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'zhanar-abdikarimova',
  category: 'inflation',
  title: 'Шымкенттегі инфляция 2026: бағалар ел бойынша орташадан баяу өсуде',
  shortTitle: 'Шымкенттегі инфляция 2026',
  description: `2026 жылғы қазанда Шымкентте жылдық инфляция ${pct(lastShym)}, ал Қазақстан бойынша ${pct(lastRk)}. Айлар бойынша динамика және оның отбасы бюджетіне әсері.`,
  blocks: [
    {
      type: 'p',
      text: `Ұлттық статистика бюросының дерегі бойынша 2026 жылғы қазанда Шымкенттегі бағалар бір жылда **${pct(lastShym)}** өсті. Бұл Қазақстан бойынша орташадан (${pct(lastRk)}), Алматыдан (${pct(CITIES_CPI_OCT.almaty)}) және Астанадан (${pct(CITIES_CPI_OCT.astana)}) төмен. Тек қазан айында қалада бағалар ${pct(SHYMKENT_CPI.octMonth)}, жыл басынан бері ${pct(SHYMKENT_CPI.octYtd)} өсті.`,
    },
    { type: 'h2', text: 'Айлар бойынша динамика' },
    {
      type: 'chart',
      chart: {
        kind: 'line',
        title: 'Жылдық инфляция: Шымкент және Қазақстан, %',
        unit: '%',
        categories: SHYMKENT_CPI.months.map((i) => CPI_MONTHS.kk[i]),
        series: [
          { name: 'Шымкент', values: SHYMKENT_CPI.values },
          { name: 'Қазақстан', values: SHYMKENT_CPI.months.map((i) => CPI_TOTAL[i]) },
        ],
        source: 'ҚР СЖРА ҰСБ, 2026',
      },
    },
    {
      type: 'p',
      text: `Көктем мен жазда Шымкент елмен қатар немесе сәл жоғары жүрді: наурызда — 10,8%, тамызда — 10,4%. Бетбұрыс қыркүйекте болды: қаладағы айлық инфляция **нөл** болды (${pct(SHYMKENT_CPI.sepMonth)}), жылдық көрсеткіш бірден 8,7%-ға түсті.`,
    },
    { type: 'h2', text: 'Неге қыркүйекте бағалар тоқтады' },
    {
      type: 'ul',
      items: [
        '**Өнім жинау.** Қыркүйек — Түркістан облысында көкөніс пен жемістің шыңы. Қызанақ, картоп, пияз, қауын арзандап, азық-түлік индексін төмендетеді.',
        '**Жоғары база.** Былтыр қыркүйекте бағалар тез өссе, биылғы жылдық көрсеткіш төмендейді.',
        '**Жалпы баяулау.** Ел бойынша азық-түлік инфляциясы қаңтардағы 12,9%-дан қазанда 7,6%-ға дейін төмендеді.',
      ],
    },
    { type: 'image', photo: 'coins-stack' },
    { type: 'h2', text: 'Бұл отбасы бюджеті үшін нені білдіреді' },
    {
      type: 'p',
      text: `${pct(lastShym)} — орташа көрсеткіш. Егер себетіңіз негізінен ет, сүт және импорт болса, жеке инфляцияңыз жоғарырақ болуы мүмкін. Маусымдық көкөністі базардан көп алсаңыз — төменірек. Ең төменгі жалақыға қанша азық-түлік алуға болатыны туралы — [бұл мақалада](/kk/blog/en-tomengi-zhalaqy-azyq-sebeti).`,
    },
    { type: 'h2', text: 'Алда не күтеміз' },
    {
      type: 'p',
      text: 'Қыста маусымдық әсер кетеді: жылыжай мен қоймадағы көкөніс қымбаттайды, айлық инфляция әдетте жеделдейді. Импорт бағасына бағам мен мөлшерлеме де әсер етеді — [базалық мөлшерлеме және бағалар](/kk/blog/bazalyq-molsherleme-bagalar). Желі бағаларын [дашбордтан](/kk/dashboard) бақылаңыз.',
    },
    { type: 'sources', items: [SRC.statRegions, SRC.nurOct, SRC.nurSep, SRC.nurAug, SRC.informOct] },
  ],
}
