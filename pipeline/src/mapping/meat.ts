import type { CategorySlug } from '../agent/taxonomy.js'

// Без \b: он не работает с кириллицей. Название начинается с вида мяса (у Dina охлаждённая конина — с «п/ф »)
const RAW_LAMB_OR_HORSE = /^(п\/ф\s+)?(баранина|конина)\s/i
const PROCESSED = /(тушен|консерв|казы|кебаб|люля|пельмен|манты|палочк|шашлык|сосиск|колбас|куырдак|котлет|чипс|гренк|сухар)/i

/**
 * СЗПТ фаза 3: сырая баранина и конина Dina лежат в разделах сети «Готовая еда» (→ `other`) и
 * «Полуфабрикаты» (→ `frozen`). Правило по названию переносит их в `meat`; готовые блюда и переработка
 * остаются в своей категории. Другие категории не трогаются.
 */
export function refineMeat(category: CategorySlug, name: string): CategorySlug {
  if (category !== 'other' && category !== 'frozen') return category
  return RAW_LAMB_OR_HORSE.test(name.trim()) && !PROCESSED.test(name) ? 'meat' : category
}
