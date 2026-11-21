import type { CategorySlug } from '../agent/taxonomy.js'
import type { StoreCode } from '../types.js'
import { storeCategoryKey, type Dictionary } from './dictionary.js'

/** Добавляет отсутствующие ключи категорий магазина; существующие (в т.ч. проверенные вручную) не меняет. Вход не мутируется */
export function seedStoreCategories(
  dict: Dictionary,
  store: StoreCode,
  scope: readonly { path: readonly string[]; slug: CategorySlug }[],
): Dictionary {
  const storeCategories = { ...dict.storeCategories }
  for (const { path, slug } of scope) {
    const key = storeCategoryKey(store, [...path])
    if (!(key in storeCategories)) storeCategories[key] = slug
  }
  return { ...dict, storeCategories }
}
