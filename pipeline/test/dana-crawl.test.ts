import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { assertCompleteScrape } from '../src/scrape-policy.js'
import { DANA_SCOPE_ROOTS, scrapeDana } from '../src/scrapers/dana.js'

const html = readFileSync(new URL('./fixtures/dana-page.html', import.meta.url), 'utf8')
/** Страница корня: меню подразделов + пагинация на 178 страниц (в тестах схлопывается до одной) */
const tilesHtml = readFileSync(new URL('./fixtures/dana-section-tiles.html', import.meta.url), 'utf8')
const leafHtml = readFileSync(new URL('./fixtures/dana-leaf.html', import.meta.url), 'utf8').replace(/PAGEN_1=\d+/g, 'PAGEN_1=1')
const rootHtml = readFileSync(new URL('./fixtures/dana-root.html', import.meta.url), 'utf8').replace(/PAGEN_1=\d+/g, 'PAGEN_1=1')

/** Сдвигает id товаров в ссылках /catalog/<раздел>/<id>/, чтобы страницы отличались друг от друга */
const withIds = (page: string, offset: number) => page.replace(/\/catalog\/(\d+)\/(\d+)\//g, (_, s, n) => `/catalog/${s}/${Number(n) + offset}/`)
const pageOf = (url: string) => Number(/PAGEN_1=(\d+)/.exec(url)?.[1] ?? 1)
const pathOf = (url: string) => new URL(url).pathname
const X = [{ path: '/catalog/9999/', name: 'X' }]
const FOOD = DANA_SCOPE_ROOTS[0]!
const ROOT_PATH = FOOD.path
const BAKALEYA = '/catalog/500/'
const MILK = '/catalog/488/'

describe('scrapeDana crawl', () => {
  it('fetches page 1 then pages 2..N', async () => {
    const urls: string[] = []
    const fakeFetch = (async (url: string) => { urls.push(String(url)); return new Response(withIds(html, pageOf(String(url)) * 100_000)) }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: X })
    expect(urls).toHaveLength(4)
    expect(file.products).toHaveLength(80)
    expect(file.errorCount).toBe(0)
    expect(file.sourceStats).toMatchObject({ mode: 'roots', pages: 4, roots: 1, sections: 0, concurrency: 3 })
  })

  it('treats 404 past the last page as end of section, not an error', async () => {
    const fakeFetch = (async (url: string) => pageOf(String(url)) === 4 ? new Response('', { status: 404 }) : new Response(withIds(html, pageOf(String(url)) * 100_000))) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: X })
    expect(file.errorCount).toBe(0)
    expect(file.products).toHaveLength(60)
  })

  it('counts an empty page >1 as an error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeFetch = (async (url: string) => pageOf(String(url)) === 3 ? new Response('<html></html>') : new Response(withIds(html, pageOf(String(url)) * 100_000))) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: X })
    expect(file.errorCount).toBe(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[DANA] /catalog/9999/ p3'))
    warn.mockRestore()
  })

  it('counts a failed page 1 as an error and skips the rest of that target', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls: string[] = []
    const fakeFetch = (async (url: string) => { calls.push(String(url)); return new Response('', { status: 404 }) }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: X })
    expect(file.errorCount).toBe(1)
    expect(calls).toHaveLength(1)
    warn.mockRestore()
  })

  it('respects concurrency', async () => {
    let active = 0, peak = 0
    const fakeFetch = (async (url: string) => {
      active++; peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 5))
      active--
      return new Response(withIds(html, pageOf(String(url)) * 100_000))
    }) as typeof fetch
    await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: X, concurrency: 2 })
    expect(peak).toBe(2)
  })

  it('output order is deterministic under random latency', async () => {
    const run = async () => {
      const fakeFetch = (async (url: string) => {
        await new Promise(r => setTimeout(r, Math.random() * 10))
        return new Response(withIds(html, pageOf(String(url)) * 100_000))
      }) as typeof fetch
      return (await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: X, concurrency: 4 })).products.map(p => p.sourceProductId)
    }
    expect(await run()).toEqual(await run())
  })
})

describe('scrapeDana modes', () => {
  const sectionIdx = (path: string) => [BAKALEYA, MILK].indexOf(path) + 1

  it('sections mode crawls only listed sections', async () => {
    const paths = new Set<string>()
    const fakeFetch = (async (url: string) => {
      const path = pathOf(String(url)); paths.add(path)
      return path === ROOT_PATH ? new Response(rootHtml) : new Response(withIds(html, sectionIdx(path) * 1_000_000 + pageOf(String(url)) * 100_000))
    }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, sections: [BAKALEYA, MILK] })
    expect([...paths].sort()).toEqual([BAKALEYA, MILK, ROOT_PATH].sort())
    expect(file.sourceStats).toMatchObject({ mode: 'sections', sections: 2 })
    expect(file.errorCount).toBe(0)
    expect(file.products).toHaveLength(160)
    for (const p of file.products) expect(p.sourceCategoryPath).toEqual(['Продукты питания'])
  })

  it('sections mode flags a section missing from the menu without requesting it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const paths = new Set<string>()
    const gone = '/catalog/999999/'
    const fakeFetch = (async (url: string) => {
      const path = pathOf(String(url)); paths.add(path)
      return path === ROOT_PATH ? new Response(rootHtml) : new Response(withIds(html, pageOf(String(url)) * 100_000))
    }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, sections: [BAKALEYA, gone] })
    expect(file.errorCount).toBe(1)
    expect(paths.has(gone)).toBe(false)
    expect(paths.has(BAKALEYA)).toBe(true)
    expect(warn).toHaveBeenCalledWith(`[DANA] section missing from menu: ${gone}`)
    warn.mockRestore()
  })

  it('sections mode with an empty menu is one error but still crawls the listed paths', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeFetch = (async (url: string) => {
      const path = pathOf(String(url))
      return path === ROOT_PATH ? new Response('<html></html>') : new Response(withIds(html, pageOf(String(url)) * 100_000))
    }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, sections: [BAKALEYA] })
    expect(file.errorCount).toBe(1)
    expect(file.products).toHaveLength(80)
    warn.mockRestore()
  })

  it('dedupes a product present in two sections and lists both sections sorted', async () => {
    const fakeFetch = (async (url: string) => {
      const path = pathOf(String(url))
      return path === ROOT_PATH ? new Response(rootHtml) : new Response(withIds(html, pageOf(String(url)) * 100_000))
    }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, sections: [MILK, BAKALEYA] })
    expect(file.products).toHaveLength(80)
    expect(file.products[0]!.rawPayload.sections).toEqual([MILK, BAKALEYA])
  })

  it('full mode annotates sections and keeps the root category path', async () => {
    const fakeFetch = (async (url: string) => {
      const path = pathOf(String(url))
      if (path === ROOT_PATH) return new Response(rootHtml)
      // Подразделам хватает одной страницы: тест проверяет аннотацию, а не объём обхода (на медленном CI 96 страниц не укладываются в 5 с)
      return new Response(withIds(html, 50_000_000 + path.length * 1_000_000).replace(/PAGEN_1=\d+/g, 'PAGEN_1=1'))
    }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: [FOOD], full: true })
    expect(file.sourceStats).toMatchObject({ mode: 'full', sections: 15 })
    const fromSection = file.products.find(p => (p.rawPayload.sections as string[]).length > 0)
    expect(fromSection).toBeDefined()
    expect(fromSection!.sourceCategoryPath).toEqual(['Продукты питания'])
    expect(file.products.some(p => (p.rawPayload.sections as string[]).length === 0)).toBe(true)
  })
})

describe('scrapeDana subsection tiles (Aspro template)', () => {
  const LEAVES = ['/catalog/485/', '/catalog/486/', '/catalog/487/']
  /** Лист с теми же 4 карточками, id сдвинуты по номеру листа, чтобы листья не сливались */
  const leafOf = (path: string) => leafHtml.replace(/(?<=\D)(16385|17599|16378|29427)(?=\D)/g, m => String(Number(m) + Number(/\d+/.exec(path)![0]) * 1000))

  it('descends from a section page of tiles into its leaves and keeps the section annotation', async () => {
    const paths: string[] = []
    const fakeFetch = (async (url: string) => {
      const path = pathOf(String(url)); paths.push(path)
      if (path === ROOT_PATH) return new Response(rootHtml)
      return path === BAKALEYA ? new Response(tilesHtml) : new Response(leafOf(path))
    }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, sections: [BAKALEYA] })
    expect(paths.filter(p => p !== ROOT_PATH).sort()).toEqual([BAKALEYA, ...LEAVES].sort())
    expect(file.errorCount).toBe(0)
    expect(file.products).toHaveLength(12)
    expect(file.products.every(p => (p.rawPayload.sections as string[]).join() === BAKALEYA)).toBe(true)
    for (const p of file.products) expect(p.sourceCategoryPath).toEqual(['Продукты питания'])
    expect(file.sourceStats).toMatchObject({ mode: 'sections', sections: 1 })
  })

  it('does not loop on tiles that point back to a visited page', async () => {
    const fakeFetch = (async (url: string) => {
      const path = pathOf(String(url))
      if (path === ROOT_PATH) return new Response(rootHtml)
      return new Response(path === BAKALEYA ? tilesHtml : tilesHtml.replace(/\/catalog\/48[567]\//g, BAKALEYA))
    }) as typeof fetch
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, sections: [BAKALEYA] })
    expect(file.products).toHaveLength(0)
    // Плитки ведут только назад: подраздел потерян, и это ошибка, а не тихий успех
    expect(file.errorCount).toBe(3)
    expect(() => assertCompleteScrape(file, { all: false })).toThrow(/refusing to write/)
    warn.mockRestore()
  })

  const crawlWithBrokenLeaf = async (broken: () => Promise<Response>) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeFetch = (async (url: string) => {
      const path = pathOf(String(url))
      if (path === ROOT_PATH) return new Response(rootHtml)
      if (path === BAKALEYA) return new Response(tilesHtml)
      return path === LEAVES[1] ? broken() : new Response(leafOf(path))
    }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, sections: [BAKALEYA] })
    warn.mockRestore()
    return file
  }

  it.each([
    ['HTTP 500', () => Promise.resolve(new Response('', { status: 500 }))],
    ['HTTP 429', () => Promise.resolve(new Response('', { status: 429 }))],
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    ['a page without cards and tiles', () => Promise.resolve(new Response('<html><body>Новый шаблон</body></html>'))],
  ])('refuses a partial sections scrape when a leaf fails with %s', async (_, broken) => {
    const file = await crawlWithBrokenLeaf(broken)
    expect(file.errorCount).toBe(1)
    expect(file.products).toHaveLength(8)
    expect(() => assertCompleteScrape(file, { all: false })).toThrow(/refusing to write/)
  })

  it('walks the pages of a leaf reached through a tile and counts a failed page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pageHtml = (path: string, page: number) => leafOf(path)
      .replace(/(?<=\D)\d{5,6}(?=\D)/g, m => String(Number(m) + page * 1_000_000))
      .replace(/PAGEN_1=\d+/g, 'PAGEN_1=2')
    const fakeFetch = (async (url: string) => {
      const path = pathOf(String(url))
      if (path === ROOT_PATH) return new Response(rootHtml)
      if (path === BAKALEYA) return new Response(tilesHtml)
      if (path === LEAVES[0] && pageOf(String(url)) === 2) return new Response('', { status: 500 })
      return new Response(pageHtml(path, pageOf(String(url))))
    }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, sections: [BAKALEYA] })
    expect(file.errorCount).toBe(1)
    expect(file.products).toHaveLength(20)
    warn.mockRestore()
  })
})
