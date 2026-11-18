import { PUBLISHED, SRC, STORES } from '../../data'
import type { Post } from '../../types'

export const post: Post = {
  slug: 'shymkent-market-nuskaulyq',
  lang: 'kk',
  published: PUBLISHED,
  updated: PUBLISHED,
  authorId: 'editorial',
  category: 'guides',
  title: 'Shymkent Market нұсқаулығы: тауарды тауып, бағаны бір минутта салыстыру',
  shortTitle: 'Shymkent Market нұсқаулығы',
  description: 'Shymkent Market-ты қалай қолдану керек: тауар іздеу, сүзгілер, Шымкент желілеріндегі бағаларды салыстыру, келі бағасы және дашборд.',
  blocks: [
    {
      type: 'p',
      text: `Shymkent Market — бір тауардың Шымкенттегі әр желіде қанша тұратынын көрсететін тегін сервис. Тіркелу қажет емес. Біз **${STORES.arbuz}, ${STORES.gramad}, ${STORES.magnumGo} және ${STORES.metro}** желілерінің онлайн жариялайтын бағаларын салыстырамыз.`,
    },
    { type: 'h2', text: '1-қадам. Тауарды табыңыз' },
    {
      type: 'ul',
      items: [
        '[Каталогтан](/kk/catalog) бастаңыз: тауарлар санаттарға бөлінген — сүт, жарма, ет, көкөніс және басқалары.',
        'Немесе іздеу жолына атауын жазыңыз: «күріш», «сүт 3,2», «күнбағыс майы».',
        'Санат ішінде сүзгілерді қолданыңыз: бренд, салмақ, майлылық, желі.',
      ],
    },
    { type: 'h2', text: '2-қадам. Бағаларды салыстырыңыз' },
    {
      type: 'p',
      text: 'Тауар бетінде ең төмен баға бірінші тұрады, қалған желілер — төменірек. Жасыл белгі «мұнда арзан» дегенді білдіреді. Тауар тек бір желіде сатылса, салыстыратын ештеңе жоқ, бірақ өзекті бағаны бәрібір көресіз.',
    },
    { type: 'h2', text: '3-қадам. Келі бағасына қараңыз' },
    {
      type: 'p',
      text: 'Әртүрлі қаптамаларды келі немесе литр бағасы бойынша салыстырыңыз — сервис оны өзі есептейді. Бұл неге маңызды екенін [бағаны қалай оқу керек](/kk/blog/bagany-qalay-oqu-kerek) мақаласында түсіндірдік.',
    },
    { type: 'image', photo: 'phone-app' },
    { type: 'h2', text: '4-қадам. Дашбордты ашыңыз' },
    {
      type: 'p',
      text: '[Дашбордта](/kk/dashboard) қала бойынша жалпы көрініс бар: бір себеттің әр желідегі құны, бағалар айырмасы және дүкендер картасы.',
    },
    { type: 'h2', text: 'Пайдалы бөлімдер' },
    {
      type: 'ul',
      items: [
        '[Сүт](/kk/collections/milk), [сүт өнімдері](/kk/collections/dairy), [жұмыртқа](/kk/collections/eggs) — ең жиі алынатын тауарлар.',
        '[Жарма](/kk/collections/groats), [қант](/kk/collections/sugar), [май](/kk/collections/oil) — қорға алуға.',
        '[Ет](/kk/collections/meat) және [көкөніс](/kk/collections/vegetables) — бағасы ең көп ауытқитын тауарлар.',
      ],
    },
    {
      type: 'callout',
      title: 'Шектеулер',
      text: 'Біз желілердің онлайн бағаларын көрсетеміз. Нақты дүкендегі баға өзгеше болуы мүмкін. Шымкентте қай желі арзан екенін [бұл мақалада](/kk/blog/shymkentte-azyq-tulik-qaida-arzan) талдадық.',
    },
    { type: 'sources', items: [SRC.statShymkent, SRC.protectRights] },
  ],
}
