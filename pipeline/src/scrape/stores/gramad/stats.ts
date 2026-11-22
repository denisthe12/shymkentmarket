import type { SourceFile } from '../../../types.js'
import { GRAMAD_SECTION_CAP } from './index.js'

export type GramadSummary = { weighted: number; weightAmbiguous: number; cappedSections: string[] }

/** Counts for the run log and sourceStats: weight flags of products and sections that hit the source cap. */
export function summarizeGramad(file: SourceFile): GramadSummary {
  let weighted = 0
  let weightAmbiguous = 0
  for (const p of file.products) {
    const raw = p.rawPayload as { isWeighted?: unknown; weightAmbiguous?: unknown } | undefined
    if (raw?.isWeighted === true) weighted++
    if (raw?.weightAmbiguous === true) weightAmbiguous++
  }
  const cappedSections: string[] = []
  for (const [key, value] of Object.entries(file.sourceStats)) {
    const m = /^cat\.(.+)\.seen$/.exec(key)
    if (m && typeof value === 'number' && value >= GRAMAD_SECTION_CAP) cappedSections.push(m[1] as string)
  }
  return { weighted, weightAmbiguous, cappedSections }
}
