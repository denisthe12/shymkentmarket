import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../../backend/prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8')

describe('anvar migrations', () => {
  it('enum migration is a single idempotent ADD VALUE', () => {
    const sql = read('20261102000000_store_anvar_enum')
    expect(sql).toMatch(/ALTER TYPE "StoreCode" ADD VALUE IF NOT EXISTS 'ANVAR';/)
    expect(sql).not.toMatch(/BEGIN|COMMIT/i) // новое значение enum нельзя использовать в той же транзакции
  })
  it('anvar rows migration is idempotent, data-only and carries the three Aktau points', () => {
    const sql = read('20261102000100_store_anvar_rows')
    expect(sql).toContain("'66abe18e-c352-4127-8426-af58b3b408b1','ANVAR','Анвар'")
    for (const id of ['4676defe-2cb7-46d0-bc43-8f55bfe395f7', '8952e80f-e2f0-4f11-9960-b2cc3faa4375', 'ab47ae23-4b36-4b28-9ace-a803b67a0c99']) expect(sql).toContain(id)
    expect(sql).toMatch(/ON CONFLICT \(code\) DO NOTHING/)
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/)
    expect(sql).not.toMatch(/DELETE|DROP|TRUNCATE|ALTER/i)
  })
})
