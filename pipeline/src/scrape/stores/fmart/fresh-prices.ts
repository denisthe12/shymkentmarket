import type { SourceFile, SourceProduct } from '../../../types.js'
import { fmartFreshId } from './parse.js'

const MIN_COMMON = 5
const MIN_SIDE = 15
const MAX_RATIO = 1.6
const MIN_RATIO = 0.625

function freshPrices(file: SourceFile): Map<string, number> {
  const prices = new Map<string, number>()
  for (const p of file.products as SourceProduct[]) {
    const raw = p.rawPayload as { weightSource?: unknown; unitPrice?: unknown }
    if (raw.weightSource !== 'fresh500') continue
    if (typeof raw.unitPrice !== 'number' || !(raw.unitPrice > 0)) continue
    prices.set(fmartFreshId(p.name), raw.unitPrice)
  }
  return prices
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Refuses a scrape whose fresh-section prices look like a different unit than in the previous file. */
export function assertFmartFreshPrices(previous: SourceFile, file: SourceFile): void {
  const before = freshPrices(previous)
  const now = freshPrices(file)
  const ratios: number[] = []
  for (const [id, price] of now) {
    const old = before.get(id)
    if (old !== undefined) ratios.push(price / old)
  }
  const hint = 'check fresh product cards in the app and remove the previous local file, keeping previous file'
  if (ratios.length < MIN_COMMON && before.size >= MIN_SIDE && now.size >= MIN_SIDE) {
    throw new Error(`${file.storeCode}: only ${ratios.length} fresh products match the previous file (${before.size} before, ${now.size} now); ${hint}`)
  }
  if (ratios.length === 0) return
  const m = median(ratios)
  if (m > MAX_RATIO || m < MIN_RATIO) {
    throw new Error(`${file.storeCode}: median fresh price ratio ${m.toFixed(3)} against the previous file is outside ${MIN_RATIO}-${MAX_RATIO}; ${hint}`)
  }
}
