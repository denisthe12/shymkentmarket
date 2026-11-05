import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const storesLine = (script: string) => script.match(/^STORES=\((.*)\)$/m)?.[1]?.split(/\s+/)

describe('store lists', () => {
  it('daily sync scrapes Anvar, the weekly full scrape does not', () => {
    expect(storesLine(read('../scripts/daily-sync.sh'))).toEqual(['dina', 'dana', 'fixprice', 'anvar'])
    // Анвар скрапится всегда в scope из 19 категорий, полный каталог не нужен
    expect(storesLine(read('../scripts/weekly-full-scrape.sh'))).toEqual(['dina', 'dana', 'fixprice'])
  })
  it('sync defaults and the ops env example require all four stores', () => {
    expect(read('../src/cli/sync.ts')).toContain("'DINA,DANA,FIX_PRICE,ANVAR'")
    expect(read('../../ops/sync/aktau-sync.env.example')).toMatch(/^SYNC_STORES=DINA,DANA,FIX_PRICE,ANVAR$/m)
  })
  it('pipeline env example has no Anvar credentials', () => {
    expect(read('../.env.example')).not.toMatch(/ANVAR_API/)
  })
})
