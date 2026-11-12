import type { TFunction } from 'i18next'
import type { FilterDto, SzptGroupDto, SzptSort, SzptUnit, UnitPriceDto } from '../api/types'
import { formatAttributeValue } from './attributes'
import { formatPrice } from './format'

// Фасовка в базовой единице группы → тот же ключ атрибута, что подписывает каталог
const SIZE_KEY: Record<SzptUnit, string> = { kg: 'weightGrams', l: 'volumeMl', '10pcs': 'packageCount' }

/** 400 → «400 г», 1950 (l) → «1,95 л», 10 (10pcs) → «10 шт» */
export function formatPackSize(size: number, unit: SzptUnit, t: TFunction): string {
  return formatAttributeValue(SIZE_KEY[unit], size, t)
}

// Ключ фасовки как фильтра: суффикс задаёт единицы подписи (lib/attributes), а перевода в data.filter.* у него нет —
// подпись берётся из szpt.size, а не «Вес»/«Объём» каталога
const SIZE_FILTER_KEY: Record<SzptUnit, string> = { kg: 'sizeGrams', l: 'sizeMl', '10pcs': 'sizeCount' }

/** Фасовки группы в виде фильтра — для тех же карточек фильтров (DynamicFilters), что в категории */
export function sizeFilter(group: SzptGroupDto, label: string): FilterDto {
  return { key: SIZE_FILTER_KEY[group.unit], label, type: 'multi-select', options: group.sizes }
}

/** { 840, kg } → «840 ₸/кг». Бэк уже посчитал значение; здесь только округление до тенге и подпись */
export function formatUnitPrice(price: UnitPriceDto, t: TFunction): string {
  return `${formatPrice(price.value)}/${t(`szpt.per.${price.unit}`)}`
}

export type SzptState = { group: string; sizes: number[]; sort: SzptSort }

/**
 * Состояние страницы группы из URL — одно и то же на сервере (prefetch) и клиенте, иначе ключи запроса
 * разойдутся. Фасовки, которых нет у группы, отбрасываются: API ответил бы на них 400
 */
export function readSzptState(params: URLSearchParams, group: SzptGroupDto): SzptState {
  const sizes = group.sizes.filter((size) => params.getAll('size').some((raw) => Number(raw) === size))
  const sort: SzptSort = params.get('sort') === 'unit_price_asc' ? 'unit_price_asc' : 'price_asc'
  return { group: group.slug, sizes, sort }
}

/** Новые параметры URL: фасовки повторяются, сортировка по умолчанию не пишется */
export function szptParams({ sizes, sort }: Pick<SzptState, 'sizes' | 'sort'>): URLSearchParams {
  const params = new URLSearchParams()
  for (const size of sizes) params.append('size', String(size))
  if (sort !== 'price_asc') params.set('sort', sort)
  return params
}
