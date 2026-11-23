import type { FmartPage, FmartRow } from './parse.js'

export const FMART_PAGE_SIZE = 100
export const FMART_MAX_PAGES = 100

export type FmartWalk = { rows: FmartRow[]; total: number }

const at = <T>(list: readonly T[], i: number): T => list[i] as T

/** The largest page that holds positions start..end whole. */
function windowFor(start: number, end: number): { page: number; perPage: number } {
  const size = end - start + 1
  for (let perPage = FMART_PAGE_SIZE; perPage >= size; perPage--) {
    const index = Math.floor(start / perPage)
    if (index === Math.floor(end / perPage)) return { page: index + 1, perPage }
  }
  throw new Error(`no window covers ${size} rows of possibly one price at positions ${start}..${end}`)
}

/**
 * Walks a section by ascending sort key (price, per kg for weighted goods). Rows of one key have no stable order, so a page
 * boundary inside such a group may repeat some rows and lose others: each group that may be cut is fetched again whole,
 * in a page of another size. The sequence of keys itself is stable and is checked against every window; the section must
 * give exactly `total` distinct rows.
 */
export async function walkFmartSection(fetchPage: (page: number, perPage: number) => Promise<FmartPage>): Promise<FmartWalk> {
  const byId = new Map<string, FmartRow>()
  const listed: FmartRow[] = []
  let total: number | null = null

  const load = async (page: number, perPage: number): Promise<{ got: FmartPage; offset: number }> => {
    const where = `page ${page} of ${perPage}`
    const got = await fetchPage(page, perPage)
    total ??= got.total
    if (got.total !== total) throw new Error(`${where}: total changed from ${total} to ${got.total}`)
    const pages = Math.ceil(total / perPage)
    if (got.totalPages !== pages && !(total === 0 && got.totalPages === 1)) {
      throw new Error(`${where}: ${got.totalPages} pages reported for total ${total}`)
    }
    const offset = (page - 1) * perPage
    const expected = Math.max(0, Math.min(perPage, total - offset))
    if (got.rows.length !== expected) throw new Error(`${where}: ${got.rows.length} rows, expected ${expected}`)
    for (const row of got.rows) {
      const known = byId.get(row.itemId)
      if (!known) byId.set(row.itemId, row)
      else if (known.sortLow !== row.sortLow || known.sortHigh !== row.sortHigh) {
        throw new Error(`product ${row.itemId} has two prices: ${known.sortLow}..${known.sortHigh} and ${row.sortLow}..${row.sortHigh}`)
      }
    }
    return { got, offset }
  }

  let maxLow = Number.NEGATIVE_INFINITY
  for (let page = 1; page === 1 || listed.length < (total ?? 0); page++) {
    const { got } = await load(page, FMART_PAGE_SIZE)
    if (got.totalPages > FMART_MAX_PAGES) throw new Error(`${got.totalPages} pages, at most ${FMART_MAX_PAGES} allowed`)
    for (const row of got.rows) {
      // With a single page nothing can be cut, so the order does not matter.
      if (got.totalPages > 1 && row.sortHigh < maxLow) {
        throw new Error(`price falls from ${maxLow} to ${row.sortHigh} at product ${row.itemId}`)
      }
      maxLow = Math.max(maxLow, row.sortLow)
      listed.push(row)
    }
  }

  // splits[i]: every row before position i surely stands before every row from i on.
  const minLowFrom = Array<number>(listed.length + 1).fill(Number.POSITIVE_INFINITY)
  for (let i = listed.length - 1; i >= 0; i--) minLowFrom[i] = Math.min(at(listed, i).sortLow, at(minLowFrom, i + 1))
  let maxHigh = Number.NEGATIVE_INFINITY
  const splits = minLowFrom.map((minLow, i) => {
    if (i > 0) maxHigh = Math.max(maxHigh, at(listed, i - 1).sortHigh)
    return i === 0 || i === listed.length || maxHigh < minLow
  })

  // A window is at most one page long, so it can never hold two groups cut by different boundaries: one window per cut group.
  for (let cut = FMART_PAGE_SIZE; cut < listed.length; cut += FMART_PAGE_SIZE) {
    if (splits[cut]) continue
    const { page, perPage } = windowFor(splits.lastIndexOf(true, cut), splits.indexOf(true, cut) - 1)
    const { got, offset } = await load(page, perPage)
    got.rows.forEach((row, i) => {
      const walked = at(listed, offset + i)
      if (row.sortHigh < walked.sortLow || row.sortLow > walked.sortHigh) {
        throw new Error(
          `page ${page} of ${perPage}: price ${row.sortLow}..${row.sortHigh} at position ${offset + i}, expected ${walked.sortLow}..${walked.sortHigh}`,
        )
      }
    })
  }

  const sectionTotal = total ?? 0
  if (byId.size !== sectionTotal) throw new Error(`${byId.size} distinct products of total ${sectionTotal}`)
  return { rows: [...byId.values()], total: sectionTotal }
}
