import type { SourceFile } from '../types.js'
import { identity, type Dictionary } from './dictionary.js'
import { isVariableWeight } from './weight.js'

/**
 * Ключи карточек словаря, у которых весовой хотя бы один товар по файлам источников.
 * Товар словаря без записи в переданных файлах весовым не считается.
 */
export function weightedCardKeys(dict: Dictionary, sources: SourceFile[]): Set<string> {
  const keys = new Set<string>()
  for (const file of sources) {
    for (const p of file.products) {
      const card = dict.products[identity(file.storeCode, p.sourceProductId)]
      if (card !== undefined && isVariableWeight(file.storeCode, p)) keys.add(card)
    }
  }
  return keys
}
