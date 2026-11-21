import type { SourceProduct, StoreCode } from '../types.js'
import type { CategorySlug } from './taxonomy.js'

export type Attributes = { volumeMl?: number; weightGrams?: number; packageCount?: number; fatPercent?: number }
export type ClassifiedProduct = { storeCode: StoreCode; product: SourceProduct; category: CategorySlug; productType: string
  brand: string | null; attributes: Attributes; displayName: string; flags: string[] }
