import type { SourceFile } from '../../../types.js'
import { MAGNUM_SCOPE } from './scope.js'

const SLUG_BY_CATEGORY = new Map(MAGNUM_SCOPE.map(c => [c.id, c.slug]))

/** Refuses an empty file or one where a scope slug has no products at all. */
export function assertMagnumCoverage(file: SourceFile): void {
  if (file.products.length === 0) throw new Error(`${file.storeCode}: no products scraped, keeping previous file`)
  const covered = new Set<string>()
  for (const p of file.products) {
    const id = (p.rawPayload as { categoryId?: unknown } | undefined)?.categoryId
    const slug = typeof id === 'string' ? SLUG_BY_CATEGORY.get(id) : undefined
    if (slug) covered.add(slug)
  }
  const missing = [...new Set(MAGNUM_SCOPE.map(c => c.slug))].filter(s => !covered.has(s))
  if (missing.length > 0) {
    throw new Error(`${file.storeCode}: no products for ${missing.join(', ')}, keeping previous file`)
  }
}
