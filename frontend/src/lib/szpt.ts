import type { TFunction } from 'i18next'
import type { SzptUnit, UnitPriceDto } from '../api/types'
import { formatAttributeValue } from './attributes'
import { formatPrice } from './format'

// Фасовка в базовой единице группы → тот же ключ атрибута, что подписывает каталог
const SIZE_KEY: Record<SzptUnit, string> = { kg: 'weightGrams', l: 'volumeMl', '10pcs': 'packageCount' }

/** 400 → «400 г», 1950 (l) → «1,95 л», 10 (10pcs) → «10 шт» */
export function formatPackSize(size: number, unit: SzptUnit, t: TFunction): string {
  return formatAttributeValue(SIZE_KEY[unit], size, t)
}

/** { 840, kg } → «840 ₸/кг». Бэк уже посчитал значение; здесь только округление до тенге и подпись */
export function formatUnitPrice(price: UnitPriceDto, t: TFunction): string {
  return `${formatPrice(price.value)}/${t(`szpt.per.${price.unit}`)}`
}
