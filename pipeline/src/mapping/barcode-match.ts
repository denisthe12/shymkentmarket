import { z } from 'zod'
import type { SourceFile, SourceProduct, StoreCode } from '../types.js'
import { DictionarySchema, identity, type Dictionary } from './dictionary.js'
import { itemAttributes, sizeConflict } from './store-match.js'
import { isVariableWeight } from './weight.js'

/**
 * Детерминированное присоединение товара новой сети к существующей карточке по общему штрихкоду (EAN-13).
 * Выполняется до субагентов: им остаются только товары без однозначной пары.
 */

export const BarcodePairSchema = z.object({ id: z.string().min(1), name: z.string().min(1), barcode: z.string().regex(/^\d{13}$/), card: z.string().min(1) })
export type BarcodePair = z.infer<typeof BarcodePairSchema>

export type BarcodeStats = {
  barcodeAttached: number; barcodeAmbiguous: number; barcodeRejectedSize: number; barcodeRejectedWeight: number; barcodeSameStore: number
}

/** Ровно 13 цифр; префиксы 20–29 — внутренние (весовые/магазинные) коды, общими между сетями не бывают */
export function isSharedBarcode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{13}$/.test(code) && !/^2\d/.test(code)
}

/** Штрихкоды товара: у Magnum rawPayload.barcodes (массив), у Gramad rawPayload.barcode (строка или null) */
function productBarcodes(store: StoreCode, product: Pick<SourceProduct, 'rawPayload'>): string[] {
  const raw = store === 'MAGNUM' ? product.rawPayload.barcodes : [product.rawPayload.barcode]
  return Array.isArray(raw) ? [...new Set(raw.filter(isSharedBarcode))].sort() : []
}

/** Штрихкод → отсортированные уникальные ключи карточек; учитываются только товары файлов, уже внесённые в словарь */
export function buildBarcodeIndex(dict: Dictionary, sources: SourceFile[]): Map<string, string[]> {
  const sets = new Map<string, Set<string>>()
  for (const file of sources) {
    for (const p of file.products) {
      const card = dict.products[identity(file.storeCode, p.sourceProductId)]
      if (card === undefined) continue
      for (const code of productBarcodes(file.storeCode, p)) {
        const set = sets.get(code) ?? new Set<string>()
        set.add(card)
        sets.set(code, set)
      }
    }
  }
  return new Map([...sets].map(([code, set]) => [code, [...set].sort()]))
}

const storeCards = (dict: Dictionary, store: StoreCode): Set<string> => {
  const prefix = `${store}:`
  return new Set(Object.entries(dict.products).filter(([id]) => id.startsWith(prefix)).map(([, card]) => card))
}

export function findBarcodePairs(
  dict: Dictionary, store: StoreCode, products: SourceProduct[], index: Map<string, string[]>, weightedCards: ReadonlySet<string>,
): { pairs: BarcodePair[]; stats: BarcodeStats } {
  const stats: BarcodeStats = { barcodeAttached: 0, barcodeAmbiguous: 0, barcodeRejectedSize: 0, barcodeRejectedWeight: 0, barcodeSameStore: 0 }
  const pairs: BarcodePair[] = []
  const taken = storeCards(dict, store)
  const ordered = [...products].sort((a, b) => (a.sourceProductId < b.sourceProductId ? -1 : a.sourceProductId > b.sourceProductId ? 1 : 0))
  for (const p of ordered) {
    const id = identity(store, p.sourceProductId)
    if (id in dict.products) continue
    const codes = productBarcodes(store, p)
    const cards = [...new Set(codes.flatMap((c) => index.get(c) ?? []))].sort()
    if (cards.length === 0) continue
    if (cards.length > 1) { stats.barcodeAmbiguous++; continue }
    const card = cards[0]!
    const canonical = dict.canonicals[card]
    if (!canonical) continue
    if (weightedCards.has(card) !== isVariableWeight(store, p)) stats.barcodeRejectedWeight++
    else if (sizeConflict(itemAttributes(p.name), canonical.attributes)) stats.barcodeRejectedSize++
    else if (taken.has(card)) stats.barcodeSameStore++
    else {
      const barcode = codes.find((c) => index.get(c)?.[0] === card)!
      pairs.push({ id, name: p.name, barcode, card })
      taken.add(card)
      stats.barcodeAttached++
    }
  }
  return { pairs, stats }
}

/** Добавляет products[id] = card; карточки не меняет. Размер и «нет товара этой сети в карточке» проверяются повторно */
export function applyBarcodePairs(base: Dictionary, store: StoreCode, pairs: BarcodePair[]): { dict: Dictionary; attached: number } {
  const products: Record<string, string> = { ...base.products }
  const taken = storeCards(base, store)
  const prefix = `${store}:`
  for (const pair of pairs) {
    if (!pair.id.startsWith(prefix)) throw new Error(`applyBarcodePairs: ${pair.id} is not a ${store} product`)
    if (pair.id in products) throw new Error(`applyBarcodePairs: ${pair.id} is already in the dictionary`)
    const card = base.canonicals[pair.card]
    if (!card) throw new Error(`applyBarcodePairs: ${pair.id}: card ${pair.card} not found`)
    if (sizeConflict(itemAttributes(pair.name), card.attributes)) throw new Error(`applyBarcodePairs: ${pair.id}: size conflicts with card ${pair.card}`)
    if (taken.has(pair.card)) throw new Error(`applyBarcodePairs: ${pair.id}: card ${pair.card} already has a ${store} product`)
    products[pair.id] = pair.card
    taken.add(pair.card)
  }
  return { dict: DictionarySchema.parse({ ...base, products }), attached: pairs.length }
}
