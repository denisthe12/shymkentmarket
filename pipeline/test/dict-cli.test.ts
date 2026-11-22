import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const PIPELINE = resolve(import.meta.dirname, '..')
const TSX = resolve(PIPELINE, 'node_modules/tsx/dist/cli.mjs')

let root: string
const dirs = () => ({ sources: resolve(root, 'sources'), mapping: resolve(root, 'mapping'), agent: resolve(root, 'agent') })

function run(script: string, args: string[]) {
  const d = dirs()
  const r = spawnSync(process.execPath, [TSX, resolve(PIPELINE, 'src/cli', script), ...args], {
    cwd: PIPELINE, encoding: 'utf8',
    env: { ...process.env, SOURCES_DIR: d.sources, MAPPING_DIR: d.mapping, AGENT_DIR: d.agent },
  })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}

const product = (id: string, name: string, weighted = false) => ({
  sourceProductId: id, name, price: 500, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null,
  sourceCategoryPath: ['Молочные продукты'], rawPayload: weighted ? { isWeighted: true, priceUnit: 'kg' } : {},
})

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'dict-cli-'))
  const d = dirs()
  mkdirSync(d.sources, { recursive: true })
  mkdirSync(d.mapping, { recursive: true })
  writeFileSync(resolve(d.sources, 'magnum.json'), JSON.stringify({
    storeCode: 'MAGNUM', city: 'Test', capturedAt: '2026-01-01T00:00:00.000Z', errorCount: 0, sourceStats: {},
    products: [product('1', 'Молоко Тест 3,2% 1 л'), product('2', 'Кефир Тест 1% 900 мл'), product('3', 'Сыр Тест весовой', true)],
  }))
  writeFileSync(resolve(d.mapping, 'dictionary.json'), JSON.stringify({
    version: 1, generatedAt: '2026-01-01T00:00:00.000Z', canonicals: {}, products: {}, storeCategories: {},
  }))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('dict:prepare / dict:apply-decisions', () => {
  it('prepare writes one batch with weighted flags and a prompt without placeholders', () => {
    const r = run('dict-prepare.ts', ['MAGNUM'])
    expect(r.code).toBe(0)
    const dir = resolve(dirs().agent, 'magnum-match')
    const batch = JSON.parse(readFileSync(resolve(dir, 'batch-001.json'), 'utf8'))
    expect(batch.map((i: { id: string }) => i.id)).toEqual(['MAGNUM:1', 'MAGNUM:2', 'MAGNUM:3'])
    expect(batch.map((i: { weighted: boolean }) => i.weighted)).toEqual([false, false, true])
    expect(existsSync(resolve(dir, 'batch-002.json'))).toBe(false)
    const prompt = readFileSync(resolve(dir, 'prompt.md'), 'utf8')
    expect(prompt).not.toContain('{{CATEGORIES}}')
    expect(prompt).toContain('displayName')
  })

  it('unknown store exits with 2', () => {
    expect(run('dict-prepare.ts', ['FOO']).code).toBe(2)
    expect(run('dict-apply-decisions.ts', ['FOO']).code).toBe(2)
    expect(run('dict-prepare.ts', []).code).toBe(2)
  })

  it('--check without decisions exits with 1 and names the batch', () => {
    run('dict-prepare.ts', ['MAGNUM'])
    const r = run('dict-apply-decisions.ts', ['MAGNUM', '--check'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('batch-001.json: missing')
  })

  it('applies valid decisions, then prepare finds 0 items', () => {
    run('dict-prepare.ts', ['MAGNUM'])
    const dir = resolve(dirs().agent, 'magnum-match')
    const decisions = [
      { id: 'MAGNUM:1', category: 'milk', match: null, confidence: 0.5, displayName: 'Молоко Тест 3,2% 1 л', brand: 'Тест' },
      { id: 'MAGNUM:2', category: 'dairy', match: null, confidence: 0.5, displayName: 'Кефир Тест 1% 900 мл', brand: 'Тест' },
      { id: 'MAGNUM:3', category: 'dairy', match: null, confidence: 0.5, displayName: 'Сыр Тест', brand: null },
    ]
    writeFileSync(resolve(dir, 'batch-001.decisions.json'), JSON.stringify(decisions))
    expect(run('dict-apply-decisions.ts', ['MAGNUM', '--check']).code).toBe(0)
    expect(JSON.parse(readFileSync(resolve(dirs().mapping, 'dictionary.json'), 'utf8')).products).toEqual({})
    const r = run('dict-apply-decisions.ts', ['MAGNUM'])
    expect(r.code).toBe(0)
    const dict = JSON.parse(readFileSync(resolve(dirs().mapping, 'dictionary.json'), 'utf8'))
    expect(Object.keys(dict.products).sort()).toEqual(['MAGNUM:1', 'MAGNUM:2', 'MAGNUM:3'])
    const again = run('dict-prepare.ts', ['MAGNUM', '--force'])
    expect(again.code).toBe(0)
    expect(again.out).toMatch(/\b0 items\b/)
  })

  it('invalid decisions exit with 1', () => {
    run('dict-prepare.ts', ['MAGNUM'])
    writeFileSync(resolve(dirs().agent, 'magnum-match', 'batch-001.decisions.json'), '[]')
    const r = run('dict-apply-decisions.ts', ['MAGNUM'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('batch-001.json: invalid')
  })

  it('missing source file exits with 2', () => {
    rmSync(resolve(dirs().sources, 'magnum.json'))
    expect(run('dict-prepare.ts', ['MAGNUM']).code).toBe(2)
  })

  it('prepare refuses to delete existing decisions without --force', () => {
    run('dict-prepare.ts', ['MAGNUM'])
    const dir = resolve(dirs().agent, 'magnum-match')
    const decisionsPath = resolve(dir, 'batch-001.decisions.json')
    writeFileSync(decisionsPath, '[]')
    const r = run('dict-prepare.ts', ['MAGNUM'])
    expect(r.code).toBe(2)
    expect(r.out).toContain('--force')
    expect(existsSync(decisionsPath)).toBe(true)
    expect(existsSync(resolve(dir, 'batch-001.json'))).toBe(true)
  })

  it('prepare --force removes decisions and logs how many', () => {
    run('dict-prepare.ts', ['MAGNUM'])
    const dir = resolve(dirs().agent, 'magnum-match')
    writeFileSync(resolve(dir, 'batch-001.decisions.json'), '[]')
    const r = run('dict-prepare.ts', ['MAGNUM', '--force'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('removed 1 decisions files')
    expect(existsSync(resolve(dir, 'batch-001.decisions.json'))).toBe(false)
    expect(existsSync(resolve(dir, 'batch-001.json'))).toBe(true)
  })

  describe('--check problems name the batch and the cause', () => {
    const good = (id: string, over: object = {}) => ({ id, category: 'milk', match: null, confidence: 0.5, displayName: 'Молоко Тест', brand: null, ...over })
    const check = (decisions: unknown[]) => {
      run('dict-prepare.ts', ['MAGNUM'])
      writeFileSync(resolve(dirs().agent, 'magnum-match', 'batch-001.decisions.json'), JSON.stringify(decisions))
      return run('dict-apply-decisions.ts', ['MAGNUM', '--check'])
    }
    const all = ['MAGNUM:1', 'MAGNUM:2', 'MAGNUM:3']

    it('unknown id', () => {
      const r = check([...all, 'MAGNUM:99'].map((id) => good(id)))
      expect(r.code).toBe(1)
      expect(r.out).toContain('batch-001.json: invalid')
      expect(r.out).toContain('unknown decisions: MAGNUM:99')
    })
    it('duplicate id', () => {
      const r = check([...all, 'MAGNUM:2'].map((id) => good(id)))
      expect(r.code).toBe(1)
      expect(r.out).toContain('batch-001.json: invalid')
      expect(r.out).toContain('duplicate decisions: MAGNUM:2')
    })
    it('missing id', () => {
      const r = check(['MAGNUM:1', 'MAGNUM:2'].map((id) => good(id)))
      expect(r.code).toBe(1)
      expect(r.out).toContain('batch-001.json: invalid')
      expect(r.out).toContain('missing decisions: MAGNUM:3')
    })
    it('blank displayName', () => {
      const r = check(all.map((id) => good(id, id === 'MAGNUM:2' ? { displayName: '   ' } : {})))
      expect(r.code).toBe(1)
      expect(r.out).toContain('batch-001.json: invalid')
      expect(r.out).toContain('decision #1 is malformed')
    })
  })
})
