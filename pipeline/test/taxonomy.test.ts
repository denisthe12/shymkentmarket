import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATEGORIES, isCategorySlug } from '../src/agent/taxonomy.js'
import { DictionarySchema, readDictionary, type Dictionary } from '../src/mapping/dictionary.js'
import { MILK_FAT_OPTIONS } from '../src/mapping/milk.js'
import { DEFAULT_PUBLISH_CATEGORIES, publishCategories } from '../src/mapping/scope.js'
import {
  assertServableSchema, buildTaxonomyMigration, filterSchemaFor, latestTaxonomyMigration, newTaxonomyMigrationPath,
} from '../src/mapping/taxonomy-sql.js'

const ROOT = resolve(import.meta.dirname, '../..')
const MIGRATIONS = join(ROOT, 'backend/prisma/migrations')
const dict = readDictionary(join(ROOT, 'data/mapping/dictionary.json'))

type Row = { id: string; slug: string; name: string; schema: { filters: { key: string; label: string; type: string; options?: (string | number)[] }[] } }
const unquote = (s: string) => s.replaceAll("''", "'")
const parseRows = (text: string): Row[] => [...text.matchAll(/^ \('((?:[^']|'')*)','((?:[^']|'')*)','((?:[^']|'')*)','((?:[^']|'')*)'\),?$/gm)]
  .map((m) => ({ id: unquote(m[1]!), slug: unquote(m[2]!), name: unquote(m[3]!), schema: JSON.parse(unquote(m[4]!)) }))

const latest = latestTaxonomyMigration(MIGRATIONS)
const sql = latest ? readFileSync(latest, 'utf8') : ''
const rows = parseRows(sql)

const card = (category: string, name: string, brand: string | null, attributes: Record<string, number> = {}) =>
  ({ name, brand, category, attributes, method: 'deterministic', confidence: 1, review: 'approved' })
const withCards = (canonicals: Record<string, unknown>): Dictionary =>
  DictionarySchema.parse({ version: 1, generatedAt: '2026-11-21T00:00:00.000Z', canonicals, products: {}, storeCategories: {} })

describe('taxonomy migration (append-only)', () => {
  it('a taxonomy migration exists and the latest one is exactly what `pnpm taxonomy:sql` generates from the dictionary', () => {
    expect(latest).not.toBeNull()
    expect(sql).toBe(buildTaxonomyMigration(dict))
  })
  it('contains exactly the published categories, no legacy other', () => {
    expect(rows.map((r) => r.slug).sort()).toEqual([...DEFAULT_PUBLISH_CATEGORIES].sort())
    expect(rows.map((r) => r.id).sort()).toEqual(rows.map((r) => `cat-${r.slug}`).sort())
    expect(sql).not.toContain("'other'")
    for (const r of rows) expect(r.name).toBe(CATEGORIES.find((c) => c.slug === r.slug)!.name)
  })
  it('updates name and filterSchema of existing rows and keeps their ids (no DO NOTHING)', () => {
    expect(sql).toContain('ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, "filterSchema" = EXCLUDED."filterSchema";')
    expect(sql).not.toMatch(/DO NOTHING/i)
    expect(sql).not.toMatch(/SET[^;]*\bid\s*=/i)
    expect(sql).not.toMatch(/DELETE|DROP|TRUNCATE/i)
  })
  it('a dictionary without cards yields categories without filters', () => {
    for (const r of parseRows(buildTaxonomyMigration(withCards({})))) expect(r.schema, r.slug).toEqual({ filters: [] })
  })
  it('every multi-select in the migration has non-empty primitive options (the API drops it otherwise)', () => {
    for (const r of rows) assertServableSchema(r.slug, r.schema)
  })
  it('the guard catches multi-select without options, with empty options and with non-primitive options', () => {
    const f = (options?: unknown) => ({ filters: [{ key: 'volumeMl', type: 'multi-select', options }] })
    expect(() => assertServableSchema('x', f())).toThrow(/without options/)
    expect(() => assertServableSchema('x', f([]))).toThrow(/without options/)
    expect(() => assertServableSchema('x', f([{ a: 1 }]))).toThrow(/primitives/)
    expect(() => assertServableSchema('x', f([1, 1]))).toThrow(/duplicate/)
    expect(() => assertServableSchema('x', { filters: [{ key: 'flag', type: 'boolean' }] })).not.toThrow()
  })
})

describe('newTaxonomyMigrationPath / latestTaxonomyMigration', () => {
  const dirWith = (...names: string[]) => {
    const d = mkdtempSync(join(tmpdir(), 'mig-'))
    for (const n of names) {
      mkdirSync(join(d, n))
      writeFileSync(join(d, n, 'migration.sql'), `-- ${n}\n`)
    }
    writeFileSync(join(d, 'migration_lock.toml'), 'provider = "postgresql"\n')
    return d
  }
  it('uses the current UTC time when it sorts after every existing migration', () => {
    const d = dirWith('20261122000000_shymkent_baseline')
    expect(newTaxonomyMigrationPath(d, new Date('2026-11-22T10:11:12Z'))).toBe(join(d, '20261122101112_shymkent_taxonomy', 'migration.sql'))
  })
  it('never sorts before the latest existing migration: picks the later of now and latest + 1s', () => {
    const d = dirWith('20261122000000_shymkent_baseline')
    expect(newTaxonomyMigrationPath(d, new Date('2026-11-21T10:00:00Z'))).toBe(join(d, '20261122000001_shymkent_taxonomy', 'migration.sql'))
    const e = dirWith('20261122000000_shymkent_baseline', '20261122235959_other')
    expect(newTaxonomyMigrationPath(e, new Date('2026-11-21T10:00:00Z'))).toBe(join(e, '20261123000000_shymkent_taxonomy', 'migration.sql'))
  })
  it('finds the latest taxonomy migration only among *_shymkent_taxonomy, or null', () => {
    const none = dirWith('20261122000000_shymkent_baseline')
    expect(latestTaxonomyMigration(none)).toBeNull()
    const d = dirWith('20261122000000_shymkent_baseline', '20261122000001_shymkent_taxonomy', '20261201000000_shymkent_taxonomy', '20261202000000_other')
    expect(latestTaxonomyMigration(d)).toBe(join(d, '20261201000000_shymkent_taxonomy', 'migration.sql'))
  })
  it('the real migrations directory has the taxonomy after the baseline', () => {
    const names = readdirSync(MIGRATIONS).filter((n) => /^\d{14}_/.test(n)).sort()
    expect(names[0]).toBe('20261122000000_shymkent_baseline')
    expect(names.some((n) => n.endsWith('_shymkent_taxonomy'))).toBe(true)
  })
})

describe('filterSchemaFor', () => {
  const d = withCards({
    m1: card('milk', 'Молоко 2.5% 1 л', 'Бренд А', { volumeMl: 1000, fatPercent: 2.5 }),
    m2: card('milk', 'Молоко 9% 1 л', 'Бренд Б', { volumeMl: 1000, fatPercent: 9 }),
    m3: card('milk', 'Сливки 10% 200 мл', 'Бренд В', { volumeMl: 200, fatPercent: 10 }),
  })
  it('milk keeps only allowlisted fat options and drops brands of cards refined into dairy', () => {
    const milk = filterSchemaFor(d, 'milk').filters
    expect(milk.find((f) => f.key === 'fatPercent')!.options).toEqual([2.5])
    expect(milk.find((f) => f.key === 'brand')!.options).toEqual(['Бренд А'])
    expect([...MILK_FAT_OPTIONS]).toEqual([1.5, 2.5, 3.2, 6])
  })
  it('dairy has no fat filter but takes brands of refined cards', () => {
    const dairy = filterSchemaFor(d, 'dairy').filters
    expect(dairy.map((f) => f.key)).toEqual(['brand'])
    expect(dairy[0]!.options).toEqual(['Бренд Б', 'Бренд В'])
  })
  it('categories without cards have no filters', () => {
    expect(filterSchemaFor(d, 'eggs')).toEqual({ filters: [] })
  })
})

describe('misc', () => {
  it('keeps legacy slugs used by dashboard baskets', () => {
    for (const s of ['milk', 'bread', 'eggs', 'sugar', 'oil', 'other']) expect(isCategorySlug(s)).toBe(true)
  })
  it('slugs are unique and kebab-case', () => {
    const slugs = CATEGORIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })
  it('PUBLISH_CATEGORIES rejects slugs that have no row in the migration', () => {
    expect(() => publishCategories('milk,sausages')).toThrow(/migration/)
    expect(publishCategories('milk,eggs')).toEqual(new Set(['milk', 'eggs']))
  })
})
