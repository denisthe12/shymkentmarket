import { z } from 'zod'
import type { Attributes } from '../agent/classify.js'
import { isCategorySlug, type CategorySlug } from '../agent/taxonomy.js'
import { extractFat, extractSize, normalizeText } from '../agent/units.js'
import type { StoreCode } from '../types.js'
import { canonicalKey, DictionarySchema, storeCategoryKey, type Dictionary, type DictionaryCanonical } from './dictionary.js'

/**
 * Инкрементальное сопоставление новой сети со словарём без LLM-кода в pipeline:
 * детерминированный код готовит кандидатов (buildCandidates), субагент выбирает совпадение,
 * applyDecisions проверяет решение и добавляет записи, не меняя существующих.
 */

export type MatchCandidate = { key: string; name: string; brand: string | null; category: CategorySlug; attributes: Attributes }
export type MatchItem = { id: string; name: string; sourceCategoryPath: string[]; candidates: MatchCandidate[] }

export const MatchDecisionSchema = z.object({
  id: z.string(), category: z.string().refine(isCategorySlug), match: z.string().nullable(), confidence: z.number().min(0).max(1),
})
export type MatchDecision = z.infer<typeof MatchDecisionSchema>

export type ApplyStats = {
  attached: number; created: number; pendingSingletons: number
  rejectedOutsideCandidates: number; rejectedSize: number; sameStoreConflicts: number
}

const SIZE_KEYS = ['weightGrams', 'volumeMl', 'packageCount', 'fatPercent'] as const

/** Размер и жирность по названию: regex — источник истины, как в agent/classify.ts */
export function itemAttributes(name: string): Attributes {
  const attrs: Attributes = { ...extractSize(name) }
  const fat = extractFat(name)
  if (fat !== null) attrs.fatPercent = fat
  return attrs
}

/** Один и тот же ключ размера/жирности с разными значениями — это разные товары */
function sizeConflict(a: Attributes, b: Record<string, number>): boolean {
  return SIZE_KEYS.some((k) => a[k] !== undefined && b[k] !== undefined && Math.abs(a[k]! - b[k]!) > 1e-9)
}

const tokens = (s: string) => new Set(normalizeText(s).split(' ').filter((t) => t.length >= 2))

type Index = { tokens: Map<string, Set<string>>; byToken: Map<string, string[]> }
const indexCache = new WeakMap<Dictionary, Map<string, Index>>()

function indexFor(dict: Dictionary, scope: ReadonlySet<CategorySlug>): Index {
  const sig = [...scope].sort().join(',')
  let perDict = indexCache.get(dict)
  if (!perDict) indexCache.set(dict, (perDict = new Map()))
  let idx = perDict.get(sig)
  if (!idx) {
    idx = { tokens: new Map(), byToken: new Map() }
    for (const [key, c] of Object.entries(dict.canonicals)) {
      if (!scope.has(c.category)) continue
      const t = tokens(c.name)
      idx.tokens.set(key, t)
      for (const tok of t) {
        const list = idx.byToken.get(tok)
        if (list) list.push(key)
        else idx.byToken.set(tok, [key])
      }
    }
    perDict.set(sig, idx)
  }
  return idx
}

export function buildCandidates(dict: Dictionary, name: string, scope: ReadonlySet<CategorySlug>, k = 8): MatchCandidate[] {
  const idx = indexFor(dict, scope)
  const own = tokens(name)
  const attrs = itemAttributes(name)
  const overlap = new Map<string, number>()
  for (const tok of own) for (const key of idx.byToken.get(tok) ?? []) overlap.set(key, (overlap.get(key) ?? 0) + 1)
  const scored: { key: string; score: number }[] = []
  for (const [key, inter] of overlap) {
    const c = dict.canonicals[key]!
    if (sizeConflict(attrs, c.attributes)) continue
    const union = own.size + idx.tokens.get(key)!.size - inter
    scored.push({ key, score: inter / union })
  }
  scored.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return scored.slice(0, k).map(({ key }) => {
    const c = dict.canonicals[key]!
    return { key, name: c.name, brand: c.brand, category: c.category, attributes: c.attributes as Attributes }
  })
}

/** null — решения валидны и покрывают ровно товары батча; иначе причина (для проверки решений перед применением) */
export function validateDecisions(items: MatchItem[], decisions: unknown): string | null {
  if (!Array.isArray(decisions)) return 'decisions file is not a JSON array'
  const parsed: MatchDecision[] = []
  for (const [i, d] of decisions.entries()) {
    const r = MatchDecisionSchema.safeParse(d)
    if (!r.success) return `decision #${i} is malformed: ${r.error.issues[0]?.message ?? 'invalid'}`
    parsed.push(r.data)
  }
  return coverageProblem(items, parsed)
}

function coverageProblem(items: MatchItem[], decisions: MatchDecision[]): string | null {
  const wanted = new Set(items.map((i) => i.id))
  const seen = new Set<string>()
  const duplicate: string[] = [], extra: string[] = []
  for (const d of decisions) {
    if (!wanted.has(d.id)) extra.push(d.id)
    else if (seen.has(d.id)) duplicate.push(d.id)
    seen.add(d.id)
  }
  const missing = [...wanted].filter((id) => !seen.has(id))
  const parts = [
    missing.length ? `missing decisions: ${missing.join(', ')}` : '',
    duplicate.length ? `duplicate decisions: ${duplicate.join(', ')}` : '',
    extra.length ? `unknown decisions: ${extra.join(', ')}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join('; ') : null
}

export function applyDecisions(base: Dictionary, store: StoreCode, items: MatchItem[], decisions: MatchDecision[]): { dict: Dictionary; stats: ApplyStats } {
  const problem = coverageProblem(items, decisions)
  if (problem) throw new Error(`applyDecisions: ${problem}`)
  const byId = new Map(decisions.map((d) => [d.id, d]))
  const stats: ApplyStats = { attached: 0, created: 0, pendingSingletons: 0, rejectedOutsideCandidates: 0, rejectedSize: 0, sameStoreConflicts: 0 }
  const canonicals: Record<string, DictionaryCanonical> = { ...base.canonicals }
  const products: Record<string, string> = { ...base.products }
  const storeCategories: Record<string, CategorySlug> = { ...base.storeCategories }

  const prefix = `${store}:`
  const withStore = new Set<string>()
  for (const [id, key] of Object.entries(base.products)) if (id.startsWith(prefix)) withStore.add(key)

  const votes = new Map<string, Map<CategorySlug, number>>()
  const vote = (item: MatchItem, category: CategorySlug) => {
    const k = storeCategoryKey(store, item.sourceCategoryPath)
    const v = votes.get(k) ?? new Map<CategorySlug, number>()
    v.set(category, (v.get(category) ?? 0) + 1)
    votes.set(k, v)
  }

  const ordered = items.map((item) => ({ item, d: byId.get(item.id)! }))
    .sort((x, y) => y.d.confidence - x.d.confidence || (x.item.id < y.item.id ? -1 : x.item.id > y.item.id ? 1 : 0))

  for (const { item, d } of ordered) {
    if (item.id in products) throw new Error(`applyDecisions: ${item.id} is already in the dictionary`)
    if (!isCategorySlug(d.category)) throw new Error(`applyDecisions: ${item.id}: unknown category ${d.category}`)
    const category = d.category as CategorySlug
    const attrs = itemAttributes(item.name)

    let attachTo: string | null = null
    let pending = false
    if (d.match !== null) {
      const card = canonicals[d.match]
      if (!item.candidates.some((c) => c.key === d.match) || !card) stats.rejectedOutsideCandidates++
      else if (sizeConflict(attrs, card.attributes)) stats.rejectedSize++
      else if (d.confidence >= 0.95) {
        if (withStore.has(d.match)) stats.sameStoreConflicts++
        else attachTo = d.match
      } else if (d.confidence >= 0.8) pending = true
    }

    if (attachTo) {
      products[item.id] = attachTo
      withStore.add(attachTo)
      stats.attached++
      vote(item, canonicals[attachTo]!.category)
      continue
    }
    const key = canonicalKey([item.id])
    if (canonicals[key]) throw new Error(`applyDecisions: canonical key collision ${key} for ${item.id}`)
    canonicals[key] = {
      name: item.name, brand: null, category, attributes: attrs as Record<string, number>,
      ...(pending
        ? { method: 'ai' as const, confidence: d.confidence, review: 'pending' as const }
        : { method: 'deterministic' as const, confidence: 1, review: 'approved' as const }),
    }
    products[item.id] = key
    stats.created++
    if (pending) stats.pendingSingletons++
    vote(item, category)
  }

  for (const [k, v] of votes) {
    if (k in storeCategories) continue
    storeCategories[k] = [...v.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0]
  }
  // generatedAt остаётся прежним: файл словаря меняется только добавлением строк
  return { dict: DictionarySchema.parse({ ...base, canonicals, products, storeCategories }), stats }
}
