import type { SourceFile } from '../../../types.js'
import { GRAMAD_SCOPE } from './scope.js'

const SLUG_BY_CATEGORY = new Map(GRAMAD_SCOPE.map(c => [c.id, c.slug]))

/**
 * The source sometimes returns partial sections without any error. About half of the ordinary volume of the
 * larger sections; other sections are too small for a threshold and are covered by the slug check only.
 */
const MIN_BY_SECTION: Readonly<Record<string, number>> = {
  '45857678': 13,
  '45857851': 10,
  '45857774': 13,
  '45857786': 14,
  '45857904': 18,
  '48384444': 8,
  '45857736': 10,
  '45857633': 6,
  '45857680': 7,
  '45857643': 45,
  '45857754': 10,
  '45857689': 14,
  '45857778': 9,
  '45857673': 14,
  '47431088': 13,
  '45857903': 29,
}

/** Refuses an empty file, a scope slug without products and a larger section far below its ordinary volume. */
export function assertGramadCoverage(file: SourceFile): void {
  if (file.products.length === 0) throw new Error(`${file.storeCode}: no products scraped, keeping previous file`)
  const covered = new Set<string>()
  const counts = new Map<string, number>()
  for (const p of file.products) {
    const id = (p.rawPayload as { categoryId?: unknown } | undefined)?.categoryId
    const slug = typeof id === 'string' ? SLUG_BY_CATEGORY.get(id) : undefined
    if (typeof id !== 'string' || !slug) continue
    covered.add(slug)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const missing = [...new Set(GRAMAD_SCOPE.map(c => c.slug))].filter(s => !covered.has(s))
  if (missing.length > 0) {
    throw new Error(`${file.storeCode}: no products for ${missing.join(', ')}, keeping previous file`)
  }
  const low = GRAMAD_SCOPE.flatMap(c => {
    const min = MIN_BY_SECTION[c.id] ?? 0
    const n = counts.get(c.id) ?? 0
    return n < min ? [`${c.path.at(-1)} ${n} of at least ${min}`] : []
  })
  if (low.length > 0) {
    throw new Error(`${file.storeCode}: too few products: ${low.join(', ')}, keeping previous file`)
  }
}
