import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptScrape, parseScrapeArgs } from '../src/scrape/accept.js'
import { readSourceFile, writeSourceFile } from '../src/source-file.js'
import type { SourceFile } from '../src/types.js'

const file = (count: number, over: Partial<SourceFile> = {}): SourceFile => ({
  storeCode: 'GRAMAD',
  city: 'Shymkent',
  capturedAt: '2026-11-23T00:00:00.000Z',
  errorCount: 0,
  sourceStats: {},
  products: Array.from({ length: count }, (_, i) => ({
    sourceProductId: `gramad_${i}`,
    name: 'Товар',
    price: 100,
    oldPrice: null,
    imageUrl: null,
    sourceUrl: null,
    brand: null,
    sourceCategoryPath: [],
    rawPayload: {},
  })),
  ...over,
})

describe('acceptScrape', () => {
  const noCoverage = () => {}
  let dir: string
  let path: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'accept-'))
    path = join(dir, 'gramad.json')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes the first file when there is nothing to compare with', () => {
    acceptScrape(path, file(3), noCoverage)
    expect(readSourceFile(path).products).toHaveLength(3)
  })

  it('refuses a drop above 10% and keeps the previous file byte for byte', () => {
    writeSourceFile(path, file(100))
    const before = readFileSync(path, 'utf8')
    expect(() => acceptScrape(path, file(89), noCoverage)).toThrow(
      /GRAMAD: 89 products, previous file has 100.*keeping previous file/,
    )
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('accepts a drop of exactly 10%', () => {
    writeSourceFile(path, file(100))
    acceptScrape(path, file(90), noCoverage)
    expect(readSourceFile(path).products).toHaveLength(90)
  })

  it('accepts growth', () => {
    writeSourceFile(path, file(100))
    acceptScrape(path, file(200), noCoverage)
    expect(readSourceFile(path).products).toHaveLength(200)
  })

  it('accepts a larger drop when the operator asked for it', () => {
    writeSourceFile(path, file(100))
    acceptScrape(path, file(50), noCoverage, { acceptDrop: true })
    expect(readSourceFile(path).products).toHaveLength(50)
  })

  it('refuses 599 to 462 and accepts 599 to 590', () => {
    writeSourceFile(path, file(599))
    expect(() => acceptScrape(path, file(462), noCoverage)).toThrow(/462 products/)
    acceptScrape(path, file(590), noCoverage)
    expect(readSourceFile(path).products).toHaveLength(590)
  })

  it('refuses a coverage failure and keeps the previous file', () => {
    writeSourceFile(path, file(100))
    const before = readFileSync(path, 'utf8')
    const uncovered = () => {
      throw new Error('uncovered')
    }
    expect(() => acceptScrape(path, file(101), uncovered)).toThrow('uncovered')
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('does not treat an I/O error on the previous file as a broken file', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mkdirSync(path)
    expect(() => acceptScrape(path, file(3), noCoverage)).toThrow(/EISDIR|EPERM|EACCES/)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('acceptDrop does not bypass coverage', () => {
    const uncovered = () => {
      throw new Error('uncovered')
    }
    expect(() => acceptScrape(path, file(50), uncovered, { acceptDrop: true })).toThrow('uncovered')
    expect(existsSync(path)).toBe(false)
  })

  it('acceptDrop does not bypass request errors', () => {
    expect(() => acceptScrape(path, file(50, { errorCount: 1 }), noCoverage, { acceptDrop: true })).toThrow(/1 .*errors?/)
    expect(existsSync(path)).toBe(false)
  })

  describe('compareWithPrevious', () => {
    const refuse = () => {
      throw new Error('unit changed')
    }

    it('refuses and keeps the previous file, also with acceptDrop', () => {
      writeSourceFile(path, file(100))
      const before = readFileSync(path, 'utf8')
      expect(() => acceptScrape(path, file(100), noCoverage, { compareWithPrevious: refuse })).toThrow('unit changed')
      expect(() => acceptScrape(path, file(50), noCoverage, { acceptDrop: true, compareWithPrevious: refuse })).toThrow('unit changed')
      expect(readFileSync(path, 'utf8')).toBe(before)
    })

    it('receives the previous and the new file', () => {
      writeSourceFile(path, file(10))
      const spy = vi.fn()
      acceptScrape(path, file(12), noCoverage, { compareWithPrevious: spy })
      expect(spy.mock.calls[0]![0].products).toHaveLength(10)
      expect(spy.mock.calls[0]![1].products).toHaveLength(12)
    })

    it('is not called without a previous file or with a broken one', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const spy = vi.fn()
      acceptScrape(path, file(3), noCoverage, { compareWithPrevious: spy })
      writeFileSync(path, '{broken', 'utf8')
      acceptScrape(path, file(3), noCoverage, { compareWithPrevious: spy })
      expect(spy).not.toHaveBeenCalled()
    })

    it('still checks the 10% drop after a passing comparison', () => {
      writeSourceFile(path, file(100))
      expect(() => acceptScrape(path, file(50), noCoverage, { compareWithPrevious: () => {} })).toThrow(/50 products/)
    })
  })

  it('replaces an unreadable previous file with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeFileSync(path, '{broken', 'utf8')
    acceptScrape(path, file(3), noCoverage)
    expect(readSourceFile(path).products).toHaveLength(3)
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('parseScrapeArgs', () => {
  it('reads the store alone', () => {
    expect(parseScrapeArgs(['GRAMAD'])).toEqual({ code: 'GRAMAD', acceptDrop: false })
  })

  it('reads --accept-drop', () => {
    expect(parseScrapeArgs(['GRAMAD', '--accept-drop'])).toEqual({ code: 'GRAMAD', acceptDrop: true })
  })

  it('rejects anything else', () => {
    expect(parseScrapeArgs([])).toBeNull()
    expect(parseScrapeArgs(['GRAMAD', '--acept-drop'])).toBeNull()
    expect(parseScrapeArgs(['GRAMAD', '--accept-drop', 'x'])).toBeNull()
  })
})
