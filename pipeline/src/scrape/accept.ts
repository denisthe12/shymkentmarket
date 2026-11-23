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

function readPrevious(path: string, storeCode: string): SourceFile | null {
  if (!existsSync(path)) return null
  try {
    return readSourceFile(path)
  } catch (err) {
    if (typeof (err as NodeJS.ErrnoException).code === 'string') throw err // ошибка чтения, а не содержимого
    // Битый прежний файл не должен навсегда блокировать исправный скрап
    console.warn(`[${storeCode}] warning: previous file is unreadable and is not compared`)
    return null
  }
}

function assertNoDrop(previous: SourceFile, file: SourceFile): void {
  const before = previous.products.length
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
  options: { acceptDrop?: boolean; compareWithPrevious?: (previous: SourceFile, file: SourceFile) => void } = {},
): void {
  assertNoErrors(file)
  assertCoverage(file)
  if (options.compareWithPrevious || !options.acceptDrop) {
    const previous = readPrevious(path, file.storeCode)
    if (previous !== null) {
      options.compareWithPrevious?.(previous, file)
      if (!options.acceptDrop) assertNoDrop(previous, file)
    }
  }
  writeSourceFile(path, file)
}
