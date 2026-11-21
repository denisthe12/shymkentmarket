// Собирает «лёгкий» слепок каталога для локальной тестовой БД (local-ingest-db.sh).
// Вход (не коммитятся, лежат в data/agent/):
//   baseline_static.sql   — stores, categories, snapshots, source_runs, store_locations
//   baseline_groups.txt   — по строке на canonical: "<category slug>|<STORE_CODE>:<sourceProductId>,..."
//                           STORE_CODE — stores.code (например MAGNUM); строка сети уже есть в baseline_static.sql
// Выход: data/agent/prod_catalog.sql — сохраняет структуру групп (какие raw в каком canonical) и сети,
// названия/цены/payload заменены заглушками: этого хватает для проверки -recluster, гейтов и API-смоука.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

const DATA = resolve(import.meta.dirname, '../../data/agent')
const STORE_CODE = /^[A-Z][A-Z0-9_]{1,31}$/
// Id сети берётся из stores по коду: скрипт не знает id ни одной сети.
const storeId = (code) => {
  if (!STORE_CODE.test(code)) throw new Error(`invalid store code: ${code}`)
  return `(SELECT id FROM public.stores WHERE code='${code}')`
}
const SNAPSHOT = 'baseline-internal-v1'
const q = (s) => `'${String(s).replaceAll("'", "''")}'`

const groups = readFileSync(resolve(DATA, 'baseline_groups.txt'), 'utf8').trim().split('\n')
const out = [readFileSync(resolve(DATA, 'baseline_static.sql'), 'utf8')]
const raws = [], canon = [], maps = [], offers = []
groups.forEach((line, gi) => {
  const [slug, members] = line.split('|')
  const cid = randomUUID()
  canon.push(`(${q(cid)},${q(`baseline group ${gi + 1}`)},(SELECT id FROM public.categories WHERE slug=${q(slug)}))`)
  for (const m of members.split(',')) {
    const [code, spid] = m.split(':')
    const rid = randomUUID()
    raws.push(`(${q(rid)},${q(SNAPSHOT)},${storeId(code)},${q(spid)},${q(`baseline ${spid}`)},100)`)
    maps.push(`(${q(randomUUID())},${q(rid)},${q(cid)},'deterministic',1,'approved')`)
    offers.push(`(${q(randomUUID())},${q(SNAPSHOT)},${q(cid)},${q(rid)},${storeId(code)},100,true,'2026-09-26 11:36:05.102')`)
  }
})
out.push(`INSERT INTO public.raw_products (id,"snapshotId","storeId","sourceProductId","rawName","rawPrice") VALUES\n${raws.join(',\n')};`)
out.push(`INSERT INTO public.canonical_products (id,name,"categoryId") VALUES\n${canon.join(',\n')};`)
out.push(`INSERT INTO public.product_mappings (id,"rawProductId","canonicalProductId","matchMethod","matchConfidence","reviewStatus") VALUES\n${maps.join(',\n')};`)
out.push(`INSERT INTO public.offers (id,"snapshotId","canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt") VALUES\n${offers.join(',\n')};`)
writeFileSync(resolve(DATA, 'prod_catalog.sql'), `${out.join('\n\n')}\n`, 'utf8')
console.log(`prod_catalog.sql: ${groups.length} canonical, ${raws.length} raw`)
