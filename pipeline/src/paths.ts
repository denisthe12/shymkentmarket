import { resolve } from 'node:path'

// Корень репозитория (pipeline/src/paths.ts → ../..)
export const REPO_ROOT = resolve(import.meta.dirname, '../..')

// Пустое значение env → дефолт; относительный путь резолвится от корня репозитория, абсолютный остаётся как есть
function dirFromEnv(value: string | undefined, fallback: string): string {
  const v = value?.trim()
  return v ? resolve(REPO_ROOT, v) : resolve(REPO_ROOT, fallback)
}

/** Каталог файлов-источников: SOURCES_DIR или data/sources */
export function sourcesDir(env: string | undefined = process.env.SOURCES_DIR): string {
  return dirFromEnv(env, 'data/sources')
}

/** Каталог вывода sync (bundle.json, unmapped.json): SYNC_OUT_DIR или data/sync */
export function syncOutDir(env: string | undefined = process.env.SYNC_OUT_DIR): string {
  return dirFromEnv(env, 'data/sync')
}

/** Каталог словаря соответствий: MAPPING_DIR или data/mapping */
export function mappingDir(env: string | undefined = process.env.MAPPING_DIR): string {
  return dirFromEnv(env, 'data/mapping')
}

/** Каталог заданий для субагентов (batch-NNN.json): AGENT_DIR или data/agent */
export function agentDir(env: string | undefined = process.env.AGENT_DIR): string {
  return dirFromEnv(env, 'data/agent')
}
