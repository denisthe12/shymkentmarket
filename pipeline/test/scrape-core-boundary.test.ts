import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CORE_DIR = fileURLToPath(new URL('../src/scrape/core/', import.meta.url))
// Paths relative to core/, subfolders included, with forward slashes.
const files = (readdirSync(CORE_DIR, { recursive: true }) as string[])
  .map(f => f.split(sep).join('/'))
  .filter(f => f.endsWith('.ts'))
const read = (f: string) => readFileSync(join(CORE_DIR, f), 'utf8')

/** Static `from '…'` / `import '…'` and dynamic `import('…')` specifiers. */
function importSpecs(text: string): string[] {
  return [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1] as string)
}

const BANNED: Array<[string, RegExp]> = [
  ...['aktau', 'shymkent', 'magnum', 'dana', 'anvar', 'fix_price', 'fix price', 'fixprice'].map(w => [w, new RegExp(w)] as [string, RegExp]),
  // "dina" is a substring of ordinary words (e.g. "ordinal"), so only as a whole word.
  ['dina', /(?<![a-z])dina(?![a-z])/],
  ...['актау', 'шымкент', 'магнум', 'дина', 'дана', 'анвар', 'фикс прайс'].map(w => [w, new RegExp(`(?<![а-яё])${w}(?![а-яё])`)] as [string, RegExp]),
]

const bannedIn = (text: string) => BANNED.filter(([, re]) => re.test(text.toLowerCase())).map(([w]) => w)

describe('scrape core boundary', () => {
  it('has the expected files', () => {
    expect(files).toEqual(expect.arrayContaining(['http.ts', 'index.ts', 'limiter.ts', 'limits.ts', 'queue.ts', 'run.ts', 'store.ts']))
  })

  it('finds static and dynamic imports', () => {
    expect(importSpecs(`import { a } from './a.js'\nimport './b.js'\nconst c = await import('../c.js')\nexport * from "./d.js"`))
      .toEqual(['./a.js', './b.js', '../c.js', './d.js'])
  })

  it('imports only node:*, zod, core files and ../../types.js', () => {
    for (const f of files) {
      const depth = f.split('/').length - 1
      const up = '../'.repeat(depth)
      const allowed = (spec: string) =>
        spec.startsWith('node:') || spec === 'zod' ||
        // within core/: ./x.js, ./sub/x.js, or ../x.js from a subfolder (never above core/)
        (/^(?:\.\/|(?:\.\.\/)+)[\w/-]+\.js$/.test(spec) && (spec.match(/\.\.\//g)?.length ?? 0) <= depth) ||
        spec === `${up}../../types.js`
      for (const spec of importSpecs(read(f))) expect(allowed(spec), `${f} imports ${spec}`).toBe(true)
    }
  })

  it('matches city and store names, Latin and Cyrillic, but not "dina" inside words', () => {
    expect(bannedIn('const ordinal = 1; // coordinates')).toEqual([])
    expect(bannedIn('Dina store')).toEqual(['dina'])
    expect(bannedIn('// Шымкент')).toEqual(['шымкент'])
    expect(bannedIn('магазин Фикс Прайс')).toEqual(['фикс прайс'])
    expect(bannedIn('Магнум')).toEqual(['магнум'])
  })

  it('has no city or store names', () => {
    for (const f of files) expect(bannedIn(read(f)), `${f} mentions`).toEqual([])
  })
})
