import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, statSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const script = resolve(import.meta.dirname, '../scripts/weekly-full-scrape.sh').replace(/\\/g, '/')
const hasBash = spawnSync('bash', ['-c', 'true']).status === 0

// Фальшивый pnpm: пишет каждый вызов в лог и падает с кодом 1 для команд из FAKE_FAIL
const FAKE_PNPM = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
for f in $FAKE_FAIL; do
  if [ "$1" = "$f" ]; then exit 1; fi
done
exit 0
`

describe.skipIf(!hasBash)('weekly-full-scrape.sh', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'weekly-full-'))
    writeFileSync(join(dir, 'pnpm'), FAKE_PNPM, 'utf8')
    chmodSync(join(dir, 'pnpm'), 0o755)
  })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  const run = (fail: string[]) => {
    const log = join(dir, `calls-${Math.random().toString(36).slice(2)}.log`)
    writeFileSync(log, '', 'utf8')
    const runDir = join(dir, `runs-${Math.random().toString(36).slice(2)}`)
    const r = spawnSync('bash', [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir.replace(/\\/g, '/')}${delimiter}${process.env.PATH}`,
        FAKE_LOG: log.replace(/\\/g, '/'),
        FAKE_FAIL: fail.join(' '),
        RUN_STATUS_DIR: runDir.replace(/\\/g, '/'),
      },
    })
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ')[0]!)
    const files = readdirSync(runDir)
    const status = files.length === 1 ? JSON.parse(readFileSync(join(runDir, files[0]!), 'utf8')) : null
    const mode = files.length === 1 ? statSync(join(runDir, files[0]!)).mode & 0o777 : 0
    return { code: r.status, out: `${r.stdout}${r.stderr}`, calls, files, status, mode }
  }
  const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/

  it('a) exits 0 and runs scrapers, both scope steps and sync when everything succeeds', () => {
    const r = run([])
    expect(r.code).toBe(0)
    expect(r.calls).toEqual(expect.arrayContaining(['scrape:dina', 'scrape:dana', 'scrape:fixprice', 'scope:dina', 'scope:dana', 'sync']))
    expect(r.out).toMatch(/\[full\] done in/)
    expect(r.out).not.toMatch(/failed scope steps/)
    expect(r.files).toHaveLength(1)
    expect(r.files[0]).toMatch(/^weekly-\d{8}T\d{6}Z\.json$/)
    if (process.platform !== 'win32') expect(r.mode).toBe(0o644)
    expect(Object.keys(r.status)).toEqual(['version', 'kind', 'startedAt', 'finishedAt', 'status', 'exitCode', 'published', 'stores', 'scopeFailed'])
    expect(r.status).toMatchObject({ version: 1, kind: 'weekly', status: 'finished', exitCode: 0, published: false, stores: { dina: 0, dana: 0, fixprice: 0 }, scopeFailed: [] })
    expect(r.status.startedAt).toMatch(ISO)
    expect(r.status.finishedAt).toMatch(ISO)
  })

  it('b) a failed scope:dana still runs sync and exits 1 naming the step', () => {
    const r = run(['scope:dana'])
    expect(r.code).toBe(1)
    expect(r.calls).toContain('sync')
    expect(r.out).toMatch(/failed scope steps: scope:dana \(see candidate files\)/)
    expect(r.status).toMatchObject({ status: 'finished', exitCode: 1, published: false, stores: { dina: 0, dana: 0, fixprice: 0 }, scopeFailed: ['scope:dana'] })
  })

  it('c) both scope steps failing still runs sync and lists both', () => {
    const r = run(['scope:dina', 'scope:dana'])
    expect(r.code).toBe(1)
    expect(r.calls).toContain('sync')
    expect(r.out).toMatch(/failed scope steps: scope:dina scope:dana/)
    expect(r.status.scopeFailed).toEqual(['scope:dina', 'scope:dana'])
  })

  it('d) a failed sync exits non-zero without the done line', () => {
    const r = run(['sync'])
    expect(r.code).not.toBe(0)
    expect(r.calls).toContain('sync')
    expect(r.out).not.toMatch(/\[full\] done in/)
    expect(r.status).toMatchObject({ status: 'finished', exitCode: r.code, scopeFailed: [] })
  })

  it('e) a failed scraper exits 1 before any scope step or sync', () => {
    const r = run(['scrape:dana'])
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/failed scrapers: dana/)
    expect(r.calls).not.toContain('scope:dina')
    expect(r.calls).not.toContain('scope:dana')
    expect(r.calls).not.toContain('sync')
    expect(r.status).toMatchObject({ status: 'finished', exitCode: 1, stores: { dina: 0, dana: 1, fixprice: 0 }, scopeFailed: [] })
  })
})
