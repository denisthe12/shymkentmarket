import type { StoreModule, StoreTask } from '../../core/index.js'
import { requestHeadersFromEnv } from '../env-headers.js'
import { almatyDay, parseFmartPage, type FmartRow } from './parse.js'
import { FMART_SECTIONS, fmartSectionName } from './scope.js'
import { summarizeFmart, type FmartRunStats } from './stats.js'
import { walkFmartSection } from './walk.js'

/** One task walks a whole section; `category` is the section id. */
export type FmartTask = StoreTask
export const HEADERS_ENV = 'FMART_REQUEST_HEADERS'

// Catalogue of one F-Mart store, "Фиркан Сити".
const API = 'https://api.f-mart.kz/gw/catalog/products'
const STORE_ID = '3'

const BY_ID = new Map(FMART_SECTIONS.map(s => [s.id, s]))

export function createFmartModule(
  env: Record<string, string | undefined>,
  now: () => Date = () => new Date(),
): { module: StoreModule<FmartTask>; runStats(): FmartRunStats } {
  const headers = { accept: 'application/json', ...requestHeadersFromEnv(env, HEADERS_ENV, 'F-Mart') }
  // Keyed by section, so a repeated section replaces its counts instead of doubling them.
  const walked = new Map<string, readonly FmartRow[]>()

  const module: StoreModule<FmartTask> = {
    storeCode: 'FMART',
    city: 'Shymkent',
    limits: { concurrency: 2, rps: 4, maxConcurrency: 4, maxRps: 8 },
    headers,

    seeds: () => FMART_SECTIONS.map(s => ({ category: s.id })),

    async handle(task, _ctx, http) {
      const section = BY_ID.get(task.category)
      if (!section) throw new Error(`F-Mart: section ${task.category} is not in FMART_SECTIONS`)
      const today = almatyDay(now())
      const { rows, total } = await walkFmartSection(async (page, perPage) => {
        const query = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
          store_id: STORE_ID,
          category_id: section.id,
          sort_by: 'price',
          sort_order: 'asc',
        })
        return parseFmartPage(await http.json(`${API}?${query}`), section, { page, perPage }, today)
      })
      const products = rows.flatMap(r => (r.product ? [r.product] : []))
      const ids = new Set<string>()
      for (const { sourceProductId } of products) {
        if (ids.has(sourceProductId)) throw new Error(`F-Mart section ${section.id}: two products share the id ${sourceProductId}`)
        ids.add(sourceProductId)
      }
      walked.set(section.id, rows)
      return { products, seen: rows.length, total }
    },

    describe(task) {
      const section = BY_ID.get(task.category)
      return `F-Mart section ${task.category} (${section ? fmartSectionName(section) : '?'})`
    },
  }
  return { module, runStats: () => summarizeFmart(walked.values()) }
}
