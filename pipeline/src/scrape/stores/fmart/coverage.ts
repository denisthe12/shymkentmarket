import type { SourceFile } from '../../../types.js'
import { FMART_SCOPE, FMART_SECTIONS, fmartSectionName } from './scope.js'

const SLUG_BY_LEAF = new Map(FMART_SCOPE.map(l => [l.id, l.slug]))

/** Falling below these means the source returned a partial catalogue without weighted or fresh goods. */
export const MIN_WEIGHTED_FLAG = 50
export const MIN_FRESH_KG = 15

/**
 * About half of the ordinary volume of accepted products, for sections with more than 15 of them;
 * the others are covered by the slug check only.
 */
export const MIN_BY_SECTION: Readonly<Record<string, number>> = {
  '3352': 25,
  '3339': 22,
  '3098': 30,
  '3096': 20,
  '3268': 9,
  '3314': 50,
  '3249': 18,
  '3269': 165,
  '100014': 13,
  '3136': 15,
  '3421': 13,
  '3816': 20,
  '4293': 15,
  '3150': 80,
  '3116': 30,
  '3094': 150,
  '3374': 20,
  '3076': 38,
  '3091': 33,
  '3618': 17,
  '3709': 25,
}

function stat(file: SourceFile, key: string): number {
  const value = file.sourceStats[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${file.storeCode}: sourceStats.${key} is missing or not a number, keeping previous file`)
  }
  return value
}

/** Refuses an empty file, a slug without products, a section or a weight kind far below its ordinary volume and many unknown leaves. */
export function assertFmartCoverage(file: SourceFile): void {
  const fail = (why: string): never => {
    throw new Error(`${file.storeCode}: ${why}, keeping previous file`)
  }
  if (file.products.length === 0) fail('no products scraped')
  const covered = new Set<string>()
  const counts = new Map<string, number>()
  for (const { rawPayload } of file.products) {
    const { sectionId, leafId } = rawPayload
    const slug = typeof leafId === 'string' ? SLUG_BY_LEAF.get(leafId) : undefined
    if (typeof sectionId !== 'string' || !slug) continue
    covered.add(slug)
    counts.set(sectionId, (counts.get(sectionId) ?? 0) + 1)
  }
  const missing = [...new Set(FMART_SCOPE.map(l => l.slug))].filter(s => !covered.has(s))
  if (missing.length > 0) fail(`no products for ${missing.join(', ')}`)

  const low = FMART_SECTIONS.flatMap(s => {
    const min = MIN_BY_SECTION[s.id] ?? 0
    const n = counts.get(s.id) ?? 0
    return n < min ? [`${fmartSectionName(s)} ${n} of at least ${min}`] : []
  })
  for (const [key, min] of [['weightedFlag', MIN_WEIGHTED_FLAG], ['weightedFresh', MIN_FRESH_KG]] as const) {
    const n = stat(file, key)
    if (n < min) low.push(`${key} ${n} of at least ${min}`)
  }
  if (low.length > 0) fail(`too few products: ${low.join(', ')}`)

  const unknown = stat(file, 'unknownLeafProducts')
  const all = file.products.length + unknown
  if (unknown * 10 > all) fail(`unknownLeafProducts ${unknown} of ${all} is more than 10%`)
}
