import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DictionarySchema, canonicalKey, readDictionary, writeDictionary, type Dictionary } from '../src/mapping/dictionary.js'
import { OverridesSchema, applyOverrides, markSplitsApplied, readOverrides, writeOverrides } from '../src/mapping/overrides.js'

const card = (name: string, category: string, review: 'approved' | 'pending' = 'approved') =>
  ({ name, brand: 'B', category, attributes: { weightGrams: 1000 }, method: 'ai', confidence: 0.9, review })
const multi = canonicalKey(['DANA:1', 'DINA:1', 'FIX_PRICE:1'])
const dict = (): Dictionary => DictionarySchema.parse({
  version: 1, generatedAt: '2026-10-06T00:00:00.000Z',
  canonicals: { [multi]: card('Соль 1 кг', 'sugar', 'pending'), c_other: card('Сахар 1 кг', 'sugar') },
  products: { 'DANA:1': multi, 'DINA:1': multi, 'FIX_PRICE:1': multi, 'DINA:9': 'c_other' }, storeCategories: {},
})
const ov = (o: object) => OverridesSchema.parse({ version: 1, ...o })
const joined = canonicalKey(['DINA:5'])
const withJoiner = (): Dictionary => DictionarySchema.parse({
  version: 1, generatedAt: '2026-10-06T00:00:00.000Z',
  canonicals: { c_orig: card('Сыр', 'dairy'), [joined]: card('Сыр', 'dairy') },
  products: { 'DANA:5': 'c_orig', 'DINA:5': joined, 'ANVAR:7': joined }, storeCategories: {},
})
const rule = { key: 'c_orig', ids: ['DINA:5'], reason: 'weight-vs-piece' }

describe('applyOverrides', () => {
  it('moves category and approves', () => {
    const d = applyOverrides(dict(), ov({ moveCategory: [{ key: multi, to: 'salt', reason: 'salt' }], approve: [{ key: multi, reason: 'checked' }] }))
    expect(d.canonicals[multi]).toMatchObject({ category: 'salt', review: 'approved' })
  })
  it('split without ids isolates every member, each id points to an existing card', () => {
    const d = applyOverrides(dict(), ov({ split: [{ key: multi, reason: 'false group' }] }))
    for (const id of ['DANA:1', 'DINA:1', 'FIX_PRICE:1']) {
      const key = d.products[id]!
      expect(key).toBe(canonicalKey([id]))
      expect(d.canonicals[key]).toMatchObject({ name: 'Соль 1 кг', brand: 'B', category: 'sugar', method: 'deterministic', confidence: 1, review: 'approved', attributes: { weightGrams: 1000 } })
    }
    expect(Object.keys(d.canonicals)).toHaveLength(4)
  })
  it('split with ids keeps the remainder together (rekeyed on collision)', () => {
    const d = applyOverrides(dict(), ov({ split: [{ key: multi, ids: ['DANA:1'], reason: 'weight-vs-piece' }] }))
    expect(d.products['DANA:1']).toBe(canonicalKey(['DANA:1']))
    expect(d.products['DINA:1']).toBe(d.products['FIX_PRICE:1'])
    expect(d.products['DINA:1']).not.toBe(d.products['DANA:1'])
    for (const k of Object.values(d.products)) expect(d.canonicals[k]).toBeDefined()
  })
  it('is idempotent', () => {
    const o = ov({ moveCategory: [{ key: 'c_other', to: 'salt', reason: 'salt' }], split: [{ key: multi, ids: ['DANA:1'], reason: 'weight' }], approve: [{ key: 'c_other', reason: 'okay' }] })
    const once = applyOverrides(dict(), o)
    expect(applyOverrides(once, o)).toEqual(once)
    const dir = mkdtempSync(join(tmpdir(), 'ov-'))
    writeDictionary(join(dir, 'a.json'), once); writeDictionary(join(dir, 'b.json'), applyOverrides(readDictionary(join(dir, 'a.json')), o))
    expect(readDictionary(join(dir, 'b.json'))).toEqual(readDictionary(join(dir, 'a.json')))
  })
  it('unknown key is an error', () => {
    expect(() => applyOverrides(dict(), ov({ moveCategory: [{ key: 'c_nope', to: 'salt', reason: 'x1x' }] }))).toThrow(/unknown canonical/)
    expect(() => applyOverrides(dict(), ov({ split: [{ key: 'c_nope', reason: 'x1x' }] }))).toThrow(/unknown canonical/)
    expect(() => applyOverrides(dict(), ov({ approve: [{ key: 'c_nope', reason: 'x1x' }] }))).toThrow(/unknown canonical/)
  })
  it('rejects ids that are not members', () => {
    expect(() => applyOverrides(dict(), ov({ split: [{ key: multi, ids: ['DINA:9'], reason: 'oops' }] }))).toThrow(/not a member/)
  })
  it('skips an applied split after a later store joined the isolated card', () => {
    const d = withJoiner()
    expect(applyOverrides(d, ov({ split: [{ ...rule, appliedAt: '2026-10-06' }] }))).toEqual(d)
  })
  it('unmarked split on the same state still throws', () => {
    expect(() => applyOverrides(withJoiner(), ov({ split: [rule] }))).toThrow(/not a member/)
  })
  it('applied split does not evict a store that joined the key holder', () => {
    const o = ov({ split: [{ key: joined, ids: ['DINA:5'], reason: 'false-group', appliedAt: '2026-10-06' }] })
    expect(applyOverrides(withJoiner(), o).products['ANVAR:7']).toBe(joined)
  })
  it('applied split with a missing card is skipped', () => {
    const o = ov({ split: [{ key: 'c_nope', ids: ['DINA:5'], reason: 'gone', appliedAt: '2026-10-06' }] })
    expect(applyOverrides(withJoiner(), o)).toEqual(withJoiner())
  })
  it('re-applying an unmarked simple split changes nothing', () => {
    const o = ov({ split: [{ key: multi, ids: ['DANA:1'], reason: 'weight' }] })
    const once = applyOverrides(dict(), o)
    expect(applyOverrides(once, o)).toEqual(once)
  })
  it('rejects a malformed appliedAt', () => {
    expect(() => ov({ split: [{ ...rule, appliedAt: '06.10.2026' }] })).toThrow()
  })
  it('markSplitsApplied dates only unmarked rules', () => {
    const o = ov({ split: [{ ...rule, appliedAt: '2026-10-06' }, { key: multi, reason: 'new' }] })
    expect(markSplitsApplied(o, '2026-11-08').split.map((s) => s.appliedAt)).toEqual(['2026-10-06', '2026-11-08'])
  })
  it('writeOverrides round-trips with one-space indent and no trailing newline', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'ov-')), 'o.json')
    const o = ov({ split: [{ ...rule, appliedAt: '2026-10-06' }] })
    writeOverrides(p, o)
    expect(readOverrides(p)).toEqual(o)
    expect(readFileSync(p, 'utf8')).toBe(JSON.stringify(o, null, 1))
  })
  it('rejects a misspelled key on a split rule', () => {
    expect(() => ov({ split: [{ ...rule, applied_at: '2026-10-06' }] })).toThrow()
  })
  it('rejects an unknown key on a move or approve rule', () => {
    expect(() => ov({ moveCategory: [{ key: 'k', to: 'salt', reason: 'salt', note: 'x' }] })).toThrow()
    expect(() => ov({ approve: [{ key: 'k', reason: 'okay', note: 'x' }] })).toThrow()
  })
  it('rejects an unknown top-level key', () => {
    expect(() => ov({ comment: 'x' })).toThrow()
  })
  it('overrides file requires a reason', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'ov-')), 'o.json')
    writeFileSync(p, JSON.stringify({ version: 1, moveCategory: [{ key: 'k', to: 'salt' }] }))
    expect(() => readOverrides(p)).toThrow()
  })
})

describe('real mapping files', () => {
  const dir = resolve(import.meta.dirname, '../../data/mapping')
  it('every split rule is marked and a full run changes nothing', () => {
    const o = readOverrides(join(dir, 'overrides.json'))
    const d = readDictionary(join(dir, 'dictionary.json'))
    expect(o.split.filter((s) => !s.appliedAt)).toEqual([])
    expect(applyOverrides(d, o)).toEqual(d)
  })
})
