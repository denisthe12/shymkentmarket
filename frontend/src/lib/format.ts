// Снимок цен — по времени Шымкента (UTC+5). Asia/Aqtau — тоже UTC+5 и не зависит от свежести tzdata
// у посетителя (Asia/Almaty перешла на UTC+5 только в 2024), поэтому зону не меняем
const TIME_ZONE = 'Asia/Aqtau'

const priceFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

/** 1590 → «1 590 ₸» (с неразрывными пробелами) */
export function formatPrice(value: number): string {
  return `${priceFormatter.format(value)} ₸`
}

/** ISO → «24.09.2026» */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(iso))
}

const percentFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

/** 34.1 → «34,1%» */
export function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`
}
