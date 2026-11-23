import type { FmartRow, FmartSkips } from './parse.js'

export type FmartRunStats = {
  weightedFlag: number
  weightedFresh: number
  skippedUnavailable: number
  skippedUnitKg: number
  skippedFreshPiece: number
  skippedExcludedLeaf: number
  unknownLeafProducts: number
  unknownLeaves: string
}

/** Counts for the run log, sourceStats and the coverage check, over the distinct rows of each section. */
export function summarizeFmart(sections: Iterable<readonly FmartRow[]>): FmartRunStats {
  const skips: FmartSkips = { unavailable: 0, excludedLeaf: 0, unknownLeaf: 0, unitKg: 0, freshPiece: 0 }
  const unknown = new Set<string>()
  let weightedFlag = 0
  let weightedFresh = 0
  for (const rows of sections) {
    for (const row of rows) {
      if (row.skip !== null) skips[row.skip]++
      if (row.unknownLeaf !== null) unknown.add(row.unknownLeaf)
      const source = row.product?.rawPayload.weightSource
      if (source === 'flag') weightedFlag++
      if (source === 'fresh500') weightedFresh++
    }
  }
  return {
    weightedFlag,
    weightedFresh,
    skippedUnavailable: skips.unavailable,
    skippedUnitKg: skips.unitKg,
    skippedFreshPiece: skips.freshPiece,
    skippedExcludedLeaf: skips.excludedLeaf,
    unknownLeafProducts: skips.unknownLeaf,
    unknownLeaves: [...unknown].sort().join(','),
  }
}
