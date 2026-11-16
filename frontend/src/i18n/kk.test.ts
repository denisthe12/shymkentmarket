import { describe, expect, it } from 'vitest'
import kk from './kk.json'

// СЗПТ фаза 3: без записи казахская версия покажет русские имена групп и категорий каталога
describe('kk names', () => {
  it('has every SZPT group of phase 3', () => {
    for (const slug of ['lamb', 'horse-meat', 'fish', 'black-tea', 'salt']) {
      expect((kk.szpt.groups as Record<string, string>)[slug], slug).toBeTruthy()
    }
  })
  it('has the catalog categories published in phase 3', () => {
    for (const slug of ['salt', 'tea-coffee', 'fish']) {
      expect((kk.data.category as Record<string, string>)[slug], slug).toBeTruthy()
    }
  })
})
