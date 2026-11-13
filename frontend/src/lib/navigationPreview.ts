import { stripLanguage } from './paths'

/** Какую заглушку показать, пока сервер готовит страницу. null — для этого адреса заглушки нет */
export type PreviewRoute =
  | { kind: 'product'; id: string }
  | { kind: 'category'; slug: string }
  | { kind: 'szpt' }
  | { kind: 'catalog' }
  | { kind: 'dashboard' }

export function previewRoute(pathname: string): PreviewRoute | null {
  const [, first, second, ...rest] = stripLanguage(pathname).split('/')
  if (rest.length > 0) return null
  if (first === 'products' && second) return { kind: 'product', id: decodeURIComponent(second) }
  if (first === 'collections' && second) return { kind: 'category', slug: decodeURIComponent(second) }
  if (first === 'szpt') return { kind: 'szpt' }
  if (second) return null
  if (first === 'catalog') return { kind: 'catalog' }
  if (first === 'dashboard') return { kind: 'dashboard' }
  return null
}

type Click = Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>

/**
 * Куда ведёт клик, если это обычный переход внутри сайта на другую страницу (не новая вкладка, не скачивание,
 * не смена языка или query той же страницы). Иначе null
 */
export function clickTarget(event: Click, anchor: HTMLAnchorElement, current: URL): string | null {
  if (event.defaultPrevented || event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return null
  const url = new URL(anchor.getAttribute('href') ?? '', current)
  if (url.origin !== current.origin) return null
  if (stripLanguage(url.pathname) === stripLanguage(current.pathname)) return null
  return url.pathname
}
