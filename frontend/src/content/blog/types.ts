import type { Language } from '../../i18n/languages'

/**
 * Текст с простой разметкой: **жирный** и [ссылка](/ru/catalog).
 * Внутренние ссылки — с префиксом языка, внешние — https://
 */
export type RichText = string

/** Столбчатый график: одна серия, самый низкий столбец (если highlightMin) — зелёный «здесь выгоднее» */
export type BarChartSpec = {
  kind: 'bar'
  title: string
  /** Подпись значения: '₸' → «1 590 ₸», '%' → «9,2%», 'count' → «1 970» */
  unit: '₸' | '%' | 'count'
  bars: { label: string; value: number }[]
  highlightMin?: boolean
  /** Откуда данные и на какую дату */
  source: string
}

/** Линейный график по месяцам: несколько серий на одной оси */
export type LineChartSpec = {
  kind: 'line'
  title: string
  unit: '%'
  categories: string[]
  series: { name: string; values: number[] }[]
  source: string
}

export type ChartSpec = BarChartSpec | LineChartSpec

export type Block =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: RichText }
  | { type: 'ul'; items: RichText[] }
  | { type: 'ol'; items: RichText[] }
  | { type: 'table'; caption?: string; head: string[]; rows: string[][] }
  | { type: 'chart'; chart: ChartSpec }
  /** Фото со стока: ключ из photos.ts; файла ещё нет — блок не выводится */
  | { type: 'image'; photo: string }
  | { type: 'callout'; title?: string; text: RichText }
  | { type: 'sources'; items: { title: string; url: string }[] }

export type PostContent = {
  title: string
  /** Короткое название для списка статей слева. По умолчанию — заголовок до двоеточия */
  shortTitle?: string
  /** meta description и анонс в списке: до 160 символов */
  description: string
  blocks: Block[]
}

export type PostCategory = 'prices' | 'inflation' | 'saving' | 'guides'

/** Статья написана на одном языке и есть только по своему адресу: /ru/blog/<slug> или /kk/blog/<slug> */
export type Post = PostContent & {
  slug: string
  lang: Language
  /** ISO-даты публикации и последнего обновления */
  published: string
  updated: string
  authorId: string
  category: PostCategory
}

export type Author = {
  id: string
  name: Record<Language, string>
  role: Record<Language, string>
  bio: Record<Language, string>
  links?: { linkedin?: string; github?: string }
  /** Редакция — организация, остальные — люди */
  kind: 'organization' | 'person'
  /**
   * Временный вымышленный автор: заменить на настоящего до продвижения блога.
   * Ссылки ведут на example.com, в JSON-LD — без sameAs
   */
  placeholder?: boolean
}
