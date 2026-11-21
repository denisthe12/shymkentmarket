import type { ClassifiedProduct } from './classify.js'
import { normalizeText } from './units.js'

export type Cluster = { members: ClassifiedProduct[]; method: 'deterministic' | 'ai'; confidence: number; review: 'approved' | 'pending' }
const id = (c: ClassifiedProduct) => `${c.storeCode}:${c.product.sourceProductId}`
const single = (m: ClassifiedProduct): Cluster => ({ members: [m], method: 'deterministic', confidence: 1, review: 'approved' })

function tokens(s: string) { return new Set(normalizeText(s).split(/[^a-zа-я0-9.]+/).filter(Boolean)) }
function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b)
  const inter = [...x].filter((t) => y.has(t)).length
  return inter / Math.max(1, x.size + y.size - inter)
}

export function applyGuards(cluster: Cluster): Cluster[] {
  if (cluster.members.length < 2) return [cluster]
  const [anchor, ...rest] = cluster.members
  const kept: ClassifiedProduct[] = [anchor!]
  const ejected: ClassifiedProduct[] = []
  const sameShape = (x: ClassifiedProduct) =>
    (['volumeMl', 'weightGrams', 'packageCount', 'fatPercent'] as const).every((k) => anchor!.attributes[k] === x.attributes[k])
  // Сначала наиболее похожие на якорь — при конфликте одной сети побеждает самый похожий
  for (const m of [...rest].sort((p, q) => similarity(anchor!.product.name, q.product.name) - similarity(anchor!.product.name, p.product.name))) {
    if (!sameShape(m) || kept.some((k) => k.storeCode === m.storeCode)) ejected.push(m)
    else kept.push(m)
  }
  return [{ ...cluster, members: kept }, ...ejected.map(single)]
}
