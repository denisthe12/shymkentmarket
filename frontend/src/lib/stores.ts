import type { StoreCode, StoreLocationDto } from '../api/types'

/**
 * Цвета сетей на карте. Свой цвет пока только у Magnum; остальные сети — нейтральный серый.
 * Зелёный не используем — он в UI значит «здесь дешевле».
 */
const STORE_COLORS: Record<string, string> = {
  MAGNUM: '#2a78d6',
}

/** Любая сеть без своего цвета — нейтральный серый */
const FALLBACK_COLOR = '#697178'

export function storeColor(code: string): string {
  return STORE_COLORS[code] ?? FALLBACK_COLOR
}

/** У точки пока нет id в контракте — ключ из сети и адреса */
export function locationKey(location: StoreLocationDto): string {
  return `${location.storeCode}:${location.address}`
}

export type StoreGroup = {
  storeCode: StoreCode
  storeName: string
  locations: StoreLocationDto[]
}

/** Точки по сетям в порядке первого появления в ответе — порядок и цвет не зависят от числа точек */
export function groupByStore(locations: StoreLocationDto[]): StoreGroup[] {
  const groups = new Map<string, StoreGroup>()
  for (const location of locations) {
    const group = groups.get(location.storeCode)
    if (group) group.locations.push(location)
    else groups.set(location.storeCode, { storeCode: location.storeCode, storeName: location.storeName, locations: [location] })
  }
  return [...groups.values()]
}
