import { existsSync } from 'node:fs'
import { readSourceFile, writeSourceFile } from '../source-file.js'
import type { SourceFile } from '../types.js'
import { assertNoErrors } from './core/index.js'

/** Порог падения числа товаров сети относительно прежнего файла, %. */
const MAX_DROP_PERCENT = 10

/** `<СЕТЬ> [--accept-drop]`; null — неверные аргументы. */
export function parseScrapeArgs(args: string[]): { code: string; acceptDrop: boolean } | null {
  const [code, flag, ...rest] = args
  if (code === undefined || rest.length > 0) return null
  if (flag !== undefined && flag !== '--accept-drop') return null
  return { code, acceptDrop: flag !== undefined }
}

function previousCount(path: string, storeCode: string): number | null {
  if (!existsSync(path)) return null
  try {
    return readSourceFile(path).products.length
  } catch (err) {
    if (typeof (err as NodeJS.ErrnoException).code === 'string') throw err // ошибка чтения, а не содержимого
    // Битый прежний файл не должен навсегда блокировать исправный скрап
    console.warn(`[${storeCode}] warning: previous file is unreadable, product count is not compared`)
    return null
  }
}

function assertNoDrop(path: string, file: SourceFile): void {
  const before = previousCount(path, file.storeCode)
  if (before === null) return
  const now = file.products.length
  if (((before - now) * 100) / before > MAX_DROP_PERCENT) {
    throw new Error(
      `${file.storeCode}: ${now} products, previous file has ${before} (drop above ${MAX_DROP_PERCENT}%), keeping previous file`,
    )
  }
}

/** Проверяет прогон и только потом заменяет файл сети; любой отказ оставляет прежний файл нетронутым. */
export function acceptScrape(
  path: string,
  file: SourceFile,
  assertCoverage: (file: SourceFile) => void,
  options: { acceptDrop?: boolean } = {},
): void {
  assertNoErrors(file)
  assertCoverage(file)
  if (!options.acceptDrop) assertNoDrop(path, file)
  writeSourceFile(path, file)
}
