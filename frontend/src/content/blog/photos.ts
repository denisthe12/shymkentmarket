import credits from './photo-credits.json'
import { PHOTO_QUERIES } from './photo-queries'

/** Скачанное фото: файл в public/blog/photos и автор — записывает scripts/fetch-blog-photos.mjs */
type Credit = {
  src: string
  width: number
  height: number
  author: string
  /** Страница фото у источника */
  url: string
  source: string
  license: string
  licenseUrl: string
}

export type Photo = Credit & { alt: string }

/** Фото для блока статьи; ещё не скачано — undefined, и блок не выводится */
export function getPhoto(id: string): Photo | undefined {
  const credit = (credits as Record<string, Credit>)[id]
  const query = PHOTO_QUERIES[id]
  return credit && query ? { ...credit, alt: query.alt } : undefined
}
