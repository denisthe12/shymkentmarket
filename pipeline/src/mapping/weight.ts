import type { SourceProduct, StoreCode } from '../types.js'

/**
 * Цена за кг (весовой товар) против цены за штуку/упаковку.
 * MAGNUM: парсер (scrape/stores/magnum/parse.ts) ставит rawPayload.isWeighted === true и priceUnit 'kg' ровно у весовых товаров,
 * цена приведена к кг. Название и единицу измерения не угадываем — только флаг.
 * Остальные сети: признака нет → false.
 */
// Правило продублировано в SQL: backend/prisma/migrations/20261122000000_shymkent_baseline/migration.sql (view offer_price_basis)
// и ops/postgres/szpt/offer_price_basis_check.sql; менять вместе.
export function isVariableWeight(storeCode: StoreCode, product: Pick<SourceProduct, 'name' | 'rawPayload'>): boolean {
  return storeCode === 'MAGNUM' && product.rawPayload.isWeighted === true
}
