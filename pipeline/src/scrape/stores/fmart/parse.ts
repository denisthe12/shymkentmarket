import { z } from 'zod'
import type { CategorySlug } from '../../../agent/taxonomy.js'
import type { SourceProduct } from '../../../types.js'

export type FmartLeaf = { id: string; slug: CategorySlug; path: readonly [string, string, string] }
export type FmartSection = {
  id: string
  fresh: boolean
  leaves: ReadonlyMap<string, FmartLeaf>
  excluded: ReadonlySet<string>
}
export type FmartSkips = { unavailable: number; excludedLeaf: number; unknownLeaf: number; unitKg: number; freshPiece: number }
export type FmartRow = {
  itemId: string
  /** Regular unit price exactly as the source reports it (the sort key of the crawl). */
  sortPrice: number
  product: SourceProduct | null
  skip: keyof FmartSkips | null
  unknownLeaf: string | null
}
export type FmartPage = { rows: FmartRow[]; total: number; totalPages: number }

/** Fresh produce sold by "piece" with unit "kg" is priced for this many grams. */
export const FMART_FRESH_UNIT_GRAMS = 500
const FRESH_VENDOR_ID = 1

const PageSchema = z.looseObject({
  items: z.array(z.unknown()),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  per_page: z.number().int(),
  total_pages: z.number().int().nonnegative(),
})

const idLike = z.union([z.number().int(), z.string().trim().min(1)])
const BaseSchema = z.looseObject({
  id: idLike,
  price: z.number().finite(),
  category_id: idLike,
  in_stock: z.boolean(),
  sellable: z.boolean(),
})

const money = z.number().finite().nullish()
const ItemSchema = BaseSchema.extend({
  name: z.string().nullish(),
  name_ru: z.string().nullish(),
  external_id: z.string().nullish(),
  sku: z.string().nullish(),
  sell_by: z.string().nullish(),
  uom: z.string().nullish(),
  vendor_id: z.number().nullish(),
  unit_g: z.number().nullish(),
  price_per_kg: money,
  sale_price: money,
  on_sale: z.boolean().nullish(),
  date_on_sale_from: z.string().nullish(),
  date_on_sale_to: z.string().nullish(),
  image_url: z.string().nullish(),
})
type Item = z.infer<typeof ItemSchema>

const THIRTEEN_DIGITS = /^\d{13}$/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Calendar date in Asia/Almaty, YYYY-MM-DD. */
export const almatyDay = (date: Date): string => DAY.format(date)

export function fmartFreshId(name: string): string {
  return `fmart_fresh_${name.trim().toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, '-')}`
}

function httpUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

/** A date or a timestamp becomes a calendar date in Asia/Almaty; null for an absent value. */
function almatyDate(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  if (DATE_ONLY.test(text)) return text
  const time = Date.parse(text)
  if (Number.isNaN(time)) throw new Error(`unparseable date ${JSON.stringify(text)}`)
  return almatyDay(new Date(time))
}

type Promo = { price: number; active: boolean; dated: boolean }

function promoOf(item: Item, regular: number, today: string): Promo | null {
  if (item.on_sale !== true || typeof item.sale_price !== 'number') return null
  const price = Math.round(item.sale_price)
  if (!(price > 0 && price < regular)) return null
  const from = almatyDate(item.date_on_sale_from)
  const to = almatyDate(item.date_on_sale_to)
  const active = (from === null || from <= today) && (to === null || today <= to)
  return { price, active, dated: from !== null || to !== null }
}

function mapItem(item: Item, section: FmartSection, leaf: FmartLeaf, today: string): SourceProduct | keyof FmartSkips {
  const regular = Math.round(item.price)
  if (regular <= 0) throw new Error(`non-positive price ${item.price}`)
  const name = item.name_ru?.trim() || item.name?.trim() || ''
  if (name === '') throw new Error('empty name')
  const ext = item.external_id?.trim() || null
  const freshVendor = item.vendor_id === FRESH_VENDOR_ID
  const sellBy = item.sell_by
  if (sellBy !== 'piece' && sellBy !== 'weight') throw new Error(`unknown sell_by ${JSON.stringify(sellBy)}`)

  const sectionFresh = section.fresh && freshVendor && sellBy === 'piece'
  if (sellBy === 'piece' && item.uom === 'кг' && !sectionFresh) return 'unitKg'
  if (sectionFresh && item.uom === 'шт') return 'freshPiece'

  let sourceProductId: string
  if (section.fresh && (freshVendor || ext === null)) sourceProductId = fmartFreshId(name)
  else if (ext !== null) sourceProductId = `fmart_${ext}`
  else throw new Error('no external_id outside the fresh section')

  const promo = promoOf(item, regular, today)
  const live = promo !== null && promo.active
  let price: number
  let oldPrice: number | null
  let regularPrice: number
  let promoPrice: number | null
  let weight: { isWeighted: boolean; weightSource: 'flag' | 'fresh500' | null; unitGrams: number | null }

  if (sellBy === 'weight') {
    const unit = item.unit_g
    const perKg = item.price_per_kg
    if (typeof unit !== 'number' || !(unit > 0)) throw new Error(`bad unit_g ${String(unit)}`)
    if (typeof perKg !== 'number' || !(perKg > 0)) throw new Error(`bad price_per_kg ${String(perKg)}`)
    const tolerance = 1000 / unit + 1
    const near = (unitPrice: number): boolean => Math.abs((unitPrice * 1000) / unit - perKg) <= tolerance
    const saleFits = promo !== null && near(promo.price)
    if (!saleFits && !near(item.price)) throw new Error(`price_per_kg ${perKg} does not match unit price ${item.price} per ${unit} g`)
    price = Math.round(perKg)
    regularPrice = Math.round((item.price * 1000) / unit)
    promoPrice = saleFits && live ? price : null
    oldPrice = promoPrice !== null && promo?.dated === true && regularPrice > price ? regularPrice : null
    weight = { isWeighted: true, weightSource: 'flag', unitGrams: unit }
  } else if (sectionFresh && item.uom === 'кг') {
    const k = 1000 / FMART_FRESH_UNIT_GRAMS
    price = (live ? promo.price : regular) * k
    regularPrice = regular * k
    promoPrice = live ? promo.price * k : null
    oldPrice = live && promo.dated ? regularPrice : null
    weight = { isWeighted: true, weightSource: 'fresh500', unitGrams: FMART_FRESH_UNIT_GRAMS }
  } else {
    price = live ? promo.price : regular
    regularPrice = regular
    promoPrice = live ? promo.price : null
    oldPrice = live && promo.dated ? regular : null
    weight = { isWeighted: false, weightSource: null, unitGrams: null }
  }

  const sku = item.sku?.trim() ?? ''
  return {
    sourceProductId,
    name,
    price,
    oldPrice,
    imageUrl: httpUrlOrNull(item.image_url),
    sourceUrl: null,
    brand: null,
    sourceCategoryPath: [...leaf.path],
    rawPayload: {
      code: ext,
      itemId: String(item.id),
      barcode: THIRTEEN_DIGITS.test(sku) ? sku : null,
      isWeighted: weight.isWeighted,
      priceUnit: weight.isWeighted ? 'kg' : null,
      weightSource: weight.weightSource,
      unitGrams: weight.unitGrams,
      unitPrice: regular,
      regularPrice,
      promoPrice,
      leafId: leaf.id,
      categoryId: leaf.id,
      sectionId: section.id,
    },
  }
}

/** One page of a section: unknown shapes and bad prices are errors, never silent skips. */
export function parseFmartPage(
  body: unknown,
  section: FmartSection,
  request: { page: number; perPage: number },
  today: string,
): FmartPage {
  const where = `F-Mart section ${section.id}`
  if (!DATE_ONLY.test(today)) throw new Error(`${where}: today must be YYYY-MM-DD`)
  const parsed = PageSchema.safeParse(body)
  if (!parsed.success) throw new Error(`${where}: response is not a product page: ${parsed.error.message}`)
  const page = parsed.data
  if (page.page !== request.page) throw new Error(`${where}: asked for page ${request.page}, got ${page.page}`)
  if (page.per_page !== request.perPage) throw new Error(`${where}: asked for ${request.perPage} per page, got ${page.per_page}`)
  if (page.items.length > request.perPage) throw new Error(`${where}: page ${request.page} has more than ${request.perPage} items`)

  const rows: FmartRow[] = []
  const ids = new Set<string>()
  for (const raw of page.items) {
    const base = BaseSchema.safeParse(raw)
    if (!base.success) {
      const id = (raw as { id?: unknown } | null)?.id
      throw new Error(`${where}: product ${String(id)} is invalid: ${base.error.message}`)
    }
    const itemId = String(base.data.id)
    const fail = (why: string): never => {
      throw new Error(`${where}: product ${itemId} ${why}`)
    }
    if (ids.has(itemId)) fail('is repeated on one page')
    ids.add(itemId)
    const sortPrice = base.data.price
    const skipRow = (skip: keyof FmartSkips, unknownLeaf: string | null = null): FmartRow => ({
      itemId, sortPrice, product: null, skip, unknownLeaf,
    })
    const leafId = String(base.data.category_id)
    if (section.excluded.has(leafId)) {
      rows.push(skipRow('excludedLeaf'))
      continue
    }
    const leaf = section.leaves.get(leafId)
    if (!leaf) {
      const name = (raw as { category_name?: unknown }).category_name
      rows.push(skipRow('unknownLeaf', typeof name === 'string' && name.trim() !== '' ? name.trim() : leafId))
      continue
    }
    if (!base.data.in_stock || !base.data.sellable) {
      rows.push(skipRow('unavailable'))
      continue
    }
    const item = ItemSchema.safeParse(raw)
    if (!item.success) return fail(`is invalid: ${item.error.message}`)
    let mapped: SourceProduct | keyof FmartSkips
    try {
      mapped = mapItem(item.data, section, leaf, today)
    } catch (e) {
      return fail(`is invalid: ${e instanceof Error ? e.message : String(e)}`)
    }
    rows.push(typeof mapped === 'string' ? skipRow(mapped) : { itemId, sortPrice, product: mapped, skip: null, unknownLeaf: null })
  }
  return { rows, total: page.total, totalPages: page.total_pages }
}
