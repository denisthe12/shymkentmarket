import { z } from 'zod'
import type { SourceProduct } from '../../../types.js'

export type MagnumPageCategory = { id: string; path: readonly string[] }
export type MagnumPage = { products: SourceProduct[]; seen: number; total: null; nextPage: number | null }

const PageSchema = z.object({
  content: z.array(z.unknown()),
  number: z.number().int().min(0),
  size: z.number().int().positive(),
})

const ItemSchema = z.object({
  itemId: z.number().int(),
  name: z.string().trim().min(1),
  price: z.number().int().positive(),
  measureUnit: z.object({
    name: z.string(),
    isDividable: z.boolean(),
    divideValue: z.number(),
    step: z.number().optional(),
  }),
  discount: z.object({ prevPrice: z.number().int().nullish() }).nullish(),
  mainImg: z.string().nullish(),
  imgList: z.array(z.string()).nullish(),
  extId: z.number().int().nullish(),
  barcodes: z.array(z.string()).nullish(),
})

const AVAILABLE = 3
const UNAVAILABLE = 0

function shouldSkip(raw: unknown, category: MagnumPageCategory): boolean {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  if (typeof r.itemId === 'number' && r.itemId <= 0) return true
  if (r.availabilityId === UNAVAILABLE) return true
  if (r.availabilityId !== AVAILABLE) {
    throw new Error(`unknown Magnum availabilityId for item ${String(r.itemId)} in category ${category.id}: ${String(r.availabilityId)}`)
  }
  if (r.isActive === false) return true
  return typeof r.price === 'number' && r.price <= 0
}

function mapItem(raw: unknown, category: MagnumPageCategory): SourceProduct {
  const idOf = (raw as { itemId?: unknown } | null)?.itemId
  const parsed = ItemSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Magnum item ${String(idOf)} in category ${category.id} is invalid: ${parsed.error.message}`)
  }
  const { itemId, name, price, measureUnit: unit, discount, mainImg, imgList, extId, barcodes } = parsed.data
  let isWeighted: boolean
  if (!unit.isDividable) isWeighted = false
  else if (unit.name === 'кг' && unit.divideValue === 1000) isWeighted = true
  else throw new Error(`unknown Magnum measure unit for item ${itemId} in category ${category.id}`)

  const prev = discount?.prevPrice
  const oldPrice = prev != null && prev > price ? Math.round(prev / 100) : null
  return {
    sourceProductId: `magnum_${itemId}`,
    name,
    price: Math.round(price / 100),
    oldPrice,
    imageUrl: mainImg || imgList?.[0] || null,
    sourceUrl: null,
    brand: null,
    sourceCategoryPath: [...category.path],
    rawPayload: {
      itemId,
      extId: extId ?? null,
      barcodes: barcodes ?? [],
      categoryId: category.id,
      isWeighted,
      priceUnit: isWeighted ? 'kg' : null,
      priceTiyn: price,
      prevPriceTiyn: prev ?? null,
      orderStepGrams: isWeighted ? unit.step ?? null : null,
    },
  }
}

/** `page` is the page that was requested; the response must echo it. */
export function parseMagnumPage(body: unknown, category: MagnumPageCategory, page: number): MagnumPage {
  const parsedPage = PageSchema.safeParse(body)
  if (!parsedPage.success) throw new Error(`Magnum category ${category.id}: response is not a catalog page`)
  const { content, number, size } = parsedPage.data
  if (number !== page) throw new Error(`Magnum category ${category.id}: requested page ${page}, received page ${number}`)
  const products: SourceProduct[] = []
  for (const raw of content) {
    if (shouldSkip(raw, category)) continue
    products.push(mapItem(raw, category))
  }
  return {
    products,
    seen: content.length,
    total: null,
    nextPage: content.length > 0 && content.length >= size ? page + 1 : null,
  }
}
