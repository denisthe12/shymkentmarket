import { z } from 'zod'
import type { SourceProduct } from '../../../types.js'

export type GramadPageCategory = { id: string; path: readonly string[] }
export type GramadSection = { products: SourceProduct[]; seen: number }

const ProductSchema = z.looseObject({
  storeProductId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price: z.number().finite(),
  promotions: z.array(z.looseObject({ price: z.number().finite() })),
  outOfStock: z.boolean(),
  imageUrl: z.string().nullish(),
})

const TileSchema = z.looseObject({ type: z.literal('PRODUCT_TILE'), data: z.unknown() })
const GridSchema = z.looseObject({
  type: z.literal('GRID'),
  data: z.looseObject({ elements: z.array(TileSchema) }),
})
const SectionSchema = z.looseObject({
  data: z.looseObject({ body: z.array(GridSchema) }),
})

const THIRTEEN_DIGITS = /^\d{13}$/
const PACKAGED_CODE = /^\d{11,13}$/
const NUMBER_TOKEN = /^\d+(?:[.,]\d+)?$/

/**
 * Loose goods are priced per kg and named with a trailing "кг" that is not a pack size,
 * and carry a code that is not an 11 to 13 digit barcode. If the two signals disagree
 * the product is not treated as weighted and is flagged as ambiguous.
 */
export function gramadWeight(name: string, code: string): { isWeighted: boolean; weightAmbiguous: boolean } {
  const tokens = name.trim().split(/\s+/).filter((t) => t.length > 0)
  const last = tokens[tokens.length - 1]
  const prev = tokens.length >= 2 ? tokens[tokens.length - 2] : undefined
  const byName =
    last !== undefined && last.toLowerCase() === 'кг' && prev !== undefined && !NUMBER_TOKEN.test(prev)
  const byCode = !PACKAGED_CODE.test(code)
  return { isWeighted: byName && byCode, weightAmbiguous: byName !== byCode }
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

function mapProduct(raw: z.infer<typeof ProductSchema>, category: GramadPageCategory): SourceProduct {
  const code = raw.storeProductId
  const regular = Math.round(raw.price)
  if (regular <= 0) throw new Error(`Gramad product ${code} in category ${category.id} has a non-positive price: ${raw.price}`)
  const positivePromos = raw.promotions.map((p) => p.price).filter((v) => v > 0)
  const minPromo = positivePromos.length > 0 ? Math.round(Math.min(...positivePromos)) : null
  const promoApplies = minPromo !== null && minPromo > 0 && minPromo < regular
  const { isWeighted, weightAmbiguous } = gramadWeight(raw.name, code)
  return {
    sourceProductId: `gramad_${code}`,
    name: raw.name,
    price: promoApplies ? minPromo : regular,
    oldPrice: promoApplies ? regular : null,
    imageUrl: httpUrlOrNull(raw.imageUrl),
    sourceUrl: null,
    brand: null,
    sourceCategoryPath: [...category.path],
    rawPayload: {
      code,
      barcode: THIRTEEN_DIGITS.test(code) ? code : null,
      isWeighted,
      priceUnit: isWeighted ? 'kg' : null,
      weightAmbiguous,
      regularPrice: regular,
      promoPrice: minPromo,
      categoryId: category.id,
    },
  }
}

/** A whole leaf section arrives in one response; unknown shapes are errors, never silent skips. */
export function parseGramadSection(body: unknown, category: GramadPageCategory): GramadSection {
  const parsed = SectionSchema.safeParse(body)
  if (!parsed.success) throw new Error(`Gramad category ${category.id}: response is not a product section: ${parsed.error.message}`)
  const products: SourceProduct[] = []
  let seen = 0
  for (const grid of parsed.data.data.body) {
    for (const tile of grid.data.elements) {
      seen++
      const product = ProductSchema.safeParse(tile.data)
      if (!product.success) {
        const code = (tile.data as { storeProductId?: unknown } | null)?.storeProductId
        throw new Error(`Gramad product ${String(code)} in category ${category.id} is invalid: ${product.error.message}`)
      }
      if (product.data.outOfStock) continue
      products.push(mapProduct(product.data, category))
    }
  }
  return { products, seen }
}
