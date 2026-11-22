import type { StoreModule, StoreTask } from '../../core/index.js'
import { parseGramadSection } from './parse.js'
import { GRAMAD_SCOPE } from './scope.js'

export type GramadTask = StoreTask
export const HEADERS_ENV = 'GRAMAD_REQUEST_HEADERS'

/** The source returns at most this many products per section. */
export const GRAMAD_SECTION_CAP = 100

// Glovo listing of the Gramad point.
const API = 'https://api.glovoapp.com'
const STORE_ID = 356240
const ADDRESS_ID = 529017

const BY_ID = new Map(GRAMAD_SCOPE.map(c => [c.id, c]))

function requestHeaders(env: Record<string, string | undefined>): Record<string, string> {
  const raw = env[HEADERS_ENV]
  if (raw === undefined || raw.trim() === '') throw new Error(`Gramad: ${HEADERS_ENV} is not set`)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Gramad: ${HEADERS_ENV} is not valid JSON`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Gramad: ${HEADERS_ENV} must be a JSON object of header names to values`)
  }
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') throw new Error(`Gramad: ${HEADERS_ENV} values must be strings`)
    out[name] = value
  }
  return out
}

export function createGramadModule(env: Record<string, string | undefined>): StoreModule<GramadTask> {
  const headers = { accept: 'application/json', ...requestHeaders(env) }
  return {
    storeCode: 'GRAMAD',
    city: 'Shymkent',
    limits: { concurrency: 2, rps: 4, maxConcurrency: 4, maxRps: 8 },
    headers,

    seeds: () => GRAMAD_SCOPE.map(c => ({ category: c.id })),

    async handle(task, _ctx, http) {
      const category = BY_ID.get(task.category)
      if (!category) throw new Error(`Gramad: section ${task.category} is not in GRAMAD_SCOPE`)
      const query = new URLSearchParams({ component: 'section', id: category.id })
      const body = await http.json(`${API}/v4/stores/${STORE_ID}/addresses/${ADDRESS_ID}/content/partial?${query}`)
      const { products, seen } = parseGramadSection(body, category)
      return { products, seen }
    },

    describe(task) {
      const leaf = BY_ID.get(task.category)?.path.at(-1) ?? '?'
      return `Gramad section ${task.category} (${leaf})`
    },
  }
}
