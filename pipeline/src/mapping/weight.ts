import type { SourceProduct, StoreCode } from '../types.js'

const DANA_WEIGHT_MARK = /(?<![а-яa-z])вес(?:ов(?:ой|ая|ое|ые))?(?![а-яa-z])|\bPLU\s*[:;]\s*\d+/i

/**
 * Цена за кг (весовой товар) против цены за штуку/упаковку.
 * DINA: API помечает весовые товары (price_type/isWeightProduct), цена приведена к кг в scrapers/dina.ts.
 * ANVAR: оффер с quant KGM (цена за кг), priceUnit 'kg' выставляет scrapers/anvar.ts.
 * DANA: признак только в названии — «PLU:1234» (код весового товара на кассовых весах, 123 товара, цена за кг, например «ОГУРЦЫ PLU:1231» 539 ₸)
 * или слово «ВЕС»/«ВЕСОВОЙ» (6 товаров) в выгрузке 2026-10-05; в листинге Aspro (с 2026-11) цена за кг подписана «/кг» (rawPayload.priceUnit).
 * FIX_PRICE: признака нет (поле unit пустое у всех товаров, весовых товаров в каталоге нет) → false.
 */
// Правило продублировано в SQL: backend/prisma/migrations/20261114000000_offer_price_basis (view offer_price_basis); менять вместе.
export function isVariableWeight(storeCode: StoreCode, product: Pick<SourceProduct, 'name' | 'rawPayload'>): boolean {
  if (storeCode === 'DINA') return product.rawPayload.price_type === 'weight' || product.rawPayload.isWeightProduct === true
  if (storeCode === 'ANVAR') return product.rawPayload.priceUnit === 'kg'
  if (storeCode === 'DANA') return product.rawPayload.priceUnit === 'kg' || DANA_WEIGHT_MARK.test(product.name)
  return false
}
