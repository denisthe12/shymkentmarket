import { Golos_Text, Montserrat } from 'next/font/google'

// next/font: шрифты раздаём сами, у системного fallback подогнаны метрики (без скачка вёрстки при подмене).
// В CSS попадают @font-face всех наборов символов (с unicode-range) — браузер сам качает те, что встретил
// в тексте. subsets решает только, что уходит в <link rel="preload">. Preload — лишь кириллица: ею написан
// заголовок страницы (LCP). Раньше preload было шесть файлов (~200 КБ): на мобильном 4G они шли с высоким
// приоритетом раньше скриптов и тянули LCP на секунды. Латиница, ₸ (latin-ext) и казахские буквы
// (cyrillic-ext) догружаются по факту, текст до этого рисуется fallback-шрифтом (display: swap)
export const golos = Golos_Text({
  subsets: ['cyrillic'],
  variable: '--font-golos',
  display: 'swap',
})

// Заголовки, цены, логотип, крупные цифры
export const montserrat = Montserrat({ subsets: ['cyrillic'], variable: '--font-montserrat', display: 'swap' })
