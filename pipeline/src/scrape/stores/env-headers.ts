/** Request headers kept out of git: a JSON object of header names to string values in one env variable. */
export function requestHeadersFromEnv(
  env: Record<string, string | undefined>,
  name: string,
  label: string,
): Record<string, string> {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') throw new Error(`${label}: ${name} is not set`)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${label}: ${name} is not valid JSON`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label}: ${name} must be a JSON object of header names to values`)
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') throw new Error(`${label}: ${name} values must be strings`)
    out[key] = value
  }
  return out
}
