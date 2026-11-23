import type { FmartPage, FmartRow } from './parse.js'

export const FMART_PAGE_SIZE = 100
export const FMART_MAX_PAGES = 100

export type FmartWalk = { rows: FmartRow[]; total: number }

/** The largest page that holds positions start..end whole. */
function windowFor(start: number, end: number): { page: number; perPage: number } {
  const size = end - start + 1
  for (let perPage = FMART_PAGE_SIZE; perPage >= size; perPage--) {
    const index = Math.floor(start / perPage)
    if (index === Math.floor(end / perPage)) return { page: index + 1, perPage }
  }
  throw new Error(`no window covers ${size} rows of one price at positions ${start}..${end}`)
}

/**
 * Walks a section by ascending price. Rows of one price have no stable order, so a page boundary inside such a group
 * may repeat some rows and lose others: each cut group is fetched again whole, in a page of another size.
 * The sequence of prices itself is stable and is checked against every window; the section must give exactly `total` distinct rows.
 */
export async function walkFmartSection(fetchPage: (page: number, perPage: number) => Promise<FmartPage>): Promise<FmartWalk> {
  const byId = new Map<string, FmartRow>()
  const prices: number[] = []
  let total: number | null = null

  const load = async (page: number, perPage: number): Promise<{ got: FmartPage; offset: number }> => {
    const at = `page ${page} of ${perPage}`
    const got = await fetchPage(page, perPage)
    total ??= got.total
    if (got.total !== total) throw new Error(`${at}: total changed from ${total} to ${got.total}`)
    const pages = Math.ceil(total / perPage)
    if (got.totalPages !== pages && !(total === 0 && got.totalPages === 1)) {
      throw new Error(`${at}: ${got.totalPages} pages reported for total ${total}`)
    }
    const offset = (page - 1) * perPage
    const expected = Math.max(0, Math.min(perPage, total - offset))
    if (got.rows.length !== expected) throw new Error(`${at}: ${got.rows.length} rows, expected ${expected}`)
    for (const row of got.rows) {
      const known = byId.get(row.itemId)
      if (!known) byId.set(row.itemId, row)
      else if (known.sortPrice !== row.sortPrice) {
        throw new Error(`product ${row.itemId} has two prices: ${known.sortPrice} and ${row.sortPrice}`)
      }
    }
    return { got, offset }
  }

  for (let page = 1; page === 1 || prices.length < (total ?? 0); page++) {
    const { got } = await load(page, FMART_PAGE_SIZE)
    if (got.totalPages > FMART_MAX_PAGES) throw new Error(`${got.totalPages} pages, at most ${FMART_MAX_PAGES} allowed`)
    for (const { itemId, sortPrice } of got.rows) {
      const last = prices.at(-1)
      if (last !== undefined && sortPrice < last) throw new Error(`price falls from ${last} to ${sortPrice} at product ${itemId}`)
      prices.push(sortPrice)
    }
  }

  // A window is at most one page long, so it can never hold two groups cut by different boundaries: one window per cut group.
  for (let cut = FMART_PAGE_SIZE; cut < prices.length; cut += FMART_PAGE_SIZE) {
    const price = prices[cut]
    if (prices[cut - 1] !== price) continue
    const { page, perPage } = windowFor(prices.indexOf(price as number), prices.lastIndexOf(price as number))
    const { got, offset } = await load(page, perPage)
    got.rows.forEach((row, i) => {
      if (row.sortPrice !== prices[offset + i]) {
        throw new Error(`page ${page} of ${perPage}: price ${row.sortPrice} at position ${offset + i}, expected ${prices[offset + i]}`)
      }
    })
  }

  const sectionTotal = total ?? 0
  if (byId.size !== sectionTotal) throw new Error(`${byId.size} distinct products of total ${sectionTotal}`)
  return { rows: [...byId.values()], total: sectionTotal }
}
