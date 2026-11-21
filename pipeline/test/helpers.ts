import type { StoreCode } from '../src/types.js'
import type { ClassifiedProduct } from '../src/agent/classify.js'
import type { CategorySlug } from '../src/agent/taxonomy.js'

export const cp = (store: string, id: string, name: string, attrs: ClassifiedProduct['attributes'],
  brand: string | null = 'FoodMaster', type = 'молоко', category: CategorySlug = type === 'сахар' ? 'sugar' : 'milk'): ClassifiedProduct => ({
  storeCode: store as ClassifiedProduct['storeCode'], category, productType: type, brand, attributes: attrs, displayName: name, flags: [],
  product: { sourceProductId: id, name, price: 500, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null, sourceCategoryPath: [], rawPayload: {} },
})

// Synthetic store codes for tests; StoreCode itself stays narrow
export const STORE_A = 'STORE_A' as StoreCode
export const STORE_B = 'STORE_B' as StoreCode
export const STORE_C = 'STORE_C' as StoreCode
