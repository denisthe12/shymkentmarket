# Безопасный `dict:apply` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm dict:apply` проходит на реальных файлах, не падает и не меняет словарь, а новые split-правила применяются ровно один раз.

**Architecture:** Ключ карточки считается по первому участнику в сортировке (`canonicalKey`), поэтому по словарю нельзя отличить «правило применено, потом кто-то присоединился» от «правило ещё не применено». Идемпотентность переносится из состояния словаря в сам файл правил: у split-правила появляется поле `appliedAt`, применённые правила пропускаются. Правила остаются в файле как история причин.

**Tech Stack:** TypeScript, zod 4, vitest, pnpm 10.

**Spec:** `docs/superpowers/reports/2026-11-07-open-questions.md` в worktree `price-difference-analysis-0f90ee`, раздел 2. Отчёт ошибается в масштабе, верны данные ниже.

## Проверенные факты

Прогон в памяти на `main` 2789c98:
- Падает одно правило: `c_efc8d0c275af57f3`, `DINA:11288` (карточка `c_0e0ad9139e278b58`, к ней присоединился `ANVAR:anvar_548808`).
- Реально меняет словарь одно правило: `c_36054be8a271af9a` отрывает `ANVAR:anvar_696891` от `DINA:14538`.
- Остальные 9 правил из списка отчёта пересоздают такую же карточку с тем же ключом. `writeDictionary` сортирует ключи, файл не меняется.
- Все 14 правил `moveCategory` ничего не меняют.
- `overrides.json` читает только `dict-apply.ts`. Ежедневный sync его не использует, поэтому на VPS и в проде действий нет.

## Global Constraints

- Прод и VPS не затрагиваются. Сначала нужен `pnpm install --frozen-lockfile` в `pipeline`: в worktree нет `node_modules`.
- Логику `applyOverrides` для неприменённых правил не менять: существующие тесты должны проходить без правок.
- Формат `overrides.json` сохранить: отступ в 1 пробел, без перевода строки в конце.
- Дата у всех 22 существующих split-правил: `2026-10-06` (коммиты `0c38acc` и `f1ed129`).
- Команды `pnpm` и `git diff` запускать из `pipeline`, команды `git add` и `git commit` из корня репозитория.

## Review Focus

- Первый запуск нового правила рядом с 22 применёнными: новое правило применяется и получает дату, старые не трогаются.
- Повторный запуск сразу после этого: словарь и `overrides.json` не меняются ни на байт.
- `appliedAt` с неверным форматом, например `06.10.2026`: чтение файла падает, правило не пропускается молча.
- Применённое правило ссылается на карточку, которой уже нет: правило пропускается без ошибки.
- Сбой между записью словаря и записью правил: повторный запуск должен завершиться без порчи. Покрыто тестом `re-applying an unmarked simple split changes nothing`.

---

### Task 1: Отметка `appliedAt` в логике и CLI

**Files:**
- Modify: `pipeline/src/mapping/overrides.ts`
- Modify: `pipeline/src/cli/dict-apply.ts`
- Test: `pipeline/test/overrides.test.ts`

**Interfaces:**
- Produces: поле `split[].appliedAt?: string` (формат `YYYY-MM-DD`)
- Produces: `markSplitsApplied(overrides: Overrides, date: string): Overrides`
- Produces: `writeOverrides(path: string, overrides: Overrides): void`

- [ ] **Step 1: Добавить падающие тесты в `describe('applyOverrides')`**

```ts
const joined = canonicalKey(['DINA:5'])
const withJoiner = (): Dictionary => DictionarySchema.parse({
  version: 1, generatedAt: '2026-10-06T00:00:00.000Z',
  canonicals: { c_orig: card('Сыр', 'dairy'), [joined]: card('Сыр', 'dairy') },
  products: { 'DANA:5': 'c_orig', 'DINA:5': joined, 'ANVAR:7': joined }, storeCategories: {},
})
const rule = { key: 'c_orig', ids: ['DINA:5'], reason: 'weight-vs-piece' }

it('skips an applied split after a later store joined the isolated card', () => {
  const d = withJoiner()
  expect(applyOverrides(d, ov({ split: [{ ...rule, appliedAt: '2026-10-06' }] }))).toEqual(d)
})
it('unmarked split on the same state still throws', () => {
  expect(() => applyOverrides(withJoiner(), ov({ split: [rule] }))).toThrow(/not a member/)
})
it('applied split does not evict a store that joined the key holder', () => {
  const d = withJoiner()
  const o = ov({ split: [{ key: joined, ids: ['DINA:5'], reason: 'false-group', appliedAt: '2026-10-06' }] })
  expect(applyOverrides(d, o).products['ANVAR:7']).toBe(joined)
})
it('applied split with a missing card is skipped', () => {
  const o = ov({ split: [{ key: 'c_nope', ids: ['DINA:5'], reason: 'gone', appliedAt: '2026-10-06' }] })
  expect(applyOverrides(withJoiner(), o)).toEqual(withJoiner())
})
it('re-applying an unmarked simple split changes nothing', () => {
  const o = ov({ split: [{ key: multi, ids: ['DANA:1'], reason: 'weight' }] })
  const once = applyOverrides(dict(), o)
  expect(applyOverrides(once, o)).toEqual(once)
})
it('rejects a malformed appliedAt', () => {
  expect(() => ov({ split: [{ ...rule, appliedAt: '06.10.2026' }] })).toThrow()
})
it('markSplitsApplied dates only unmarked rules', () => {
  const o = ov({ split: [{ ...rule, appliedAt: '2026-10-06' }, { key: multi, reason: 'new' }] })
  expect(markSplitsApplied(o, '2026-11-08').split.map((s) => s.appliedAt)).toEqual(['2026-10-06', '2026-11-08'])
})
it('writeOverrides round-trips with one-space indent and no trailing newline', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'ov-')), 'o.json')
  const o = ov({ split: [{ ...rule, appliedAt: '2026-10-06' }] })
  writeOverrides(p, o)
  expect(readOverrides(p)).toEqual(o)
  expect(readFileSync(p, 'utf8')).toBe(JSON.stringify(o, null, 1))
})
```

Добавить в импорты `readFileSync` из `node:fs`, `markSplitsApplied` и `writeOverrides` из `overrides.js`.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm exec vitest run test/overrides.test.ts`
Expected: FAIL. Падают новые тесты, кроме `unmarked split on the same state still throws` и `re-applying an unmarked simple split changes nothing`: они описывают текущее поведение.

- [ ] **Step 3: Реализовать в `pipeline/src/mapping/overrides.ts`**

- В схему split после `reason` добавить `appliedAt: z.iso.date().optional()`. Порядок важен: он задаёт порядок полей в файле.
- Первой строкой цикла по `overrides.split` добавить `if (s.appliedAt) continue`.
- Заменить комментарий над `applyOverrides`: применённые split-правила пропускаются, потому что по словарю нельзя определить, применено ли правило.
- `markSplitsApplied` возвращает новый объект и ставит `date` только правилам без `appliedAt`.
- `writeOverrides` пишет `JSON.stringify(overrides, null, 1)` через `${path}.tmp` и `renameSync`, как `writeDictionary`.

- [ ] **Step 4: Обновить `pipeline/src/cli/dict-apply.ts`**

Порядок: `applyOverrides`, затем `writeDictionary`, затем `writeOverrides(path, markSplitsApplied(overrides, today))`, где `today = new Date().toISOString().slice(0, 10)`. Словарь пишется первым: если запись правил сорвётся, повторный запуск снова применит только новые правила.

- [ ] **Step 5: Убедиться, что тесты и типы проходят**

Run: `pnpm exec vitest run test/overrides.test.ts && pnpm typecheck`
Expected: PASS, включая все прежние тесты.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/mapping/overrides.ts pipeline/src/cli/dict-apply.ts pipeline/test/overrides.test.ts
git commit -m "fix(pipeline): make split overrides one-shot with appliedAt"
```

---

### Task 2: Отметить существующие правила и закрепить реальные файлы

**Files:**
- Modify: `data/mapping/overrides.json`
- Modify: `docs/data/SYNC_RUNBOOK.md:59`
- Test: `pipeline/test/overrides.test.ts`

**Interfaces:**
- Consumes: `appliedAt`, `readOverrides`, `applyOverrides` из Task 1

- [ ] **Step 1: Добавить падающий тест на реальных файлах**

```ts
describe('real mapping files', () => {
  const dir = resolve(import.meta.dirname, '../../data/mapping')
  it('every split rule is marked and a full run changes nothing', () => {
    const o = readOverrides(join(dir, 'overrides.json'))
    const d = readDictionary(join(dir, 'dictionary.json'))
    expect(o.split.filter((s) => !s.appliedAt)).toEqual([])
    expect(applyOverrides(d, o)).toEqual(d)
  })
})
```

Добавить `resolve` в импорт из `node:path`.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm exec vitest run test/overrides.test.ts -t "real mapping files"`
Expected: FAIL, в списке 22 правила без `appliedAt`.

- [ ] **Step 3: Проставить `appliedAt: "2026-10-06"` всем 22 split-правилам**

Разовый скрипт через `readOverrides`, `markSplitsApplied` и `writeOverrides`, в репозиторий не добавлять.

Run: `git diff --stat -- ../data/mapping/overrides.json`
Expected: только добавленные строки `appliedAt` и запятые у `reason`, 44 вставки и 22 удаления. Других изменений нет.

- [ ] **Step 4: Прогнать команду на настоящих файлах**

Run: `pnpm exec vitest run && pnpm dict:apply && git diff --exit-code -- ../data/mapping/dictionary.json`
Expected: тесты PASS, команда печатает `[dict:apply] canonicals 21519 → 21519`, словарь без изменений.

Запомнить `git hash-object ../data/mapping/overrides.json`, повторить `pnpm dict:apply` и сравнить хеш: он не должен измениться.

- [ ] **Step 5: Добавить строку в таблицу `docs/data/SYNC_RUNBOOK.md` сразу после `canonical_merge_conflict`**

```markdown
| `canonical_split_conflict` | карточку в словаре разделили, и две группы претендуют на один прежний ID. Строгий ingest падает, пока не пройдёт разовый `cmd/ingest -recluster -apply`. Скрытие через непубликуемую категорию этой ошибки не вызывает |
```

- [ ] **Step 6: Commit**

```bash
git add data/mapping/overrides.json pipeline/test/overrides.test.ts docs/data/SYNC_RUNBOOK.md
git commit -m "fix(data): mark applied split overrides and document split conflict"
```
