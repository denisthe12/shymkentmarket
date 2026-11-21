export type StoreLimits = {
  concurrency: number
  rps: number
  maxConcurrency: number
  maxRps: number
}

/** Positive integer from env: empty -> def; garbage, <= 0, fractional -> def; above max -> max. */
export function resolveLimit(
  raw: string | undefined,
  name: string,
  def: number,
  max: number,
  warn: (msg: string) => void = console.warn,
): number {
  const value = raw?.trim()
  if (!value) return def
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) {
    warn(`${name}=${value} is not a positive integer, using ${def}`)
    return def
  }
  if (n > max) {
    warn(`${name}=${value} exceeds the maximum ${max}, using ${max}`)
    return max
  }
  return n
}

/** Reads <STORE>_CONCURRENCY and <STORE>_RPS from env. */
export function resolveStoreLimits(
  storeCode: string,
  limits: StoreLimits,
  env: Record<string, string | undefined>,
  warn: (msg: string) => void = console.warn,
): { concurrency: number; rps: number } {
  const code = storeCode.toUpperCase()
  return {
    concurrency: resolveLimit(env[`${code}_CONCURRENCY`], `${code}_CONCURRENCY`, limits.concurrency, limits.maxConcurrency, warn),
    rps: resolveLimit(env[`${code}_RPS`], `${code}_RPS`, limits.rps, limits.maxRps, warn),
  }
}
