import type { SourceProduct, StoreCode } from '../types.js'

/**
 * Цена за кг (весовой товар) против цены за штуку/упаковку.
 * MAGNUM: парсер (scrape/stores/magnum/parse.ts) ставит rawPayload.isWeighted === true и priceUnit 'kg' ровно у весовых товаров,
 * цена приведена к кг. Название и единицу измерения не угадываем — только флаг.
 * Остальные сети: признака нет → false.
 */
// Правило продублировано в SQL: последняя миграция, определяющая view offer_price_basis (сейчас базовая миграция Шымкента),
// и ops/postgres/szpt/offer_price_basis_check.sql. Изменение правила = новая миграция, пересоздающая view (существующие миграции не правятся).
export function isVariableWeight(storeCode: StoreCode, product: Pick<SourceProduct, 'name' | 'rawPayload'>): boolean {
  return storeCode === 'MAGNUM' && product.rawPayload.isWeighted === true
}
