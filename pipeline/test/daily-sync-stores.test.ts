import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const storesLine = (script: string) => script.match(/^STORES=\((.*)\)$/m)?.[1]?.split(/\s+/)

describe('store lists', () => {
  it('daily sync scrapes Magnum and Gramad', () => {
    expect(storesLine(read('../scripts/daily-sync.sh'))).toEqual(['magnum', 'gramad'])
  })
  it('sync defaults and the ops env example require Magnum and Gramad', () => {
    expect(read('../src/cli/sync.ts')).toContain("'MAGNUM,GRAMAD'")
    expect(read('../../ops/sync/aktau-sync.env.example')).toMatch(/^SYNC_STORES=MAGNUM,GRAMAD$/m)
  })
  it('pipeline env example has no Gemini keys', () => {
    expect(read('../.env.example')).not.toMatch(/GEMINI/)
  })
})
