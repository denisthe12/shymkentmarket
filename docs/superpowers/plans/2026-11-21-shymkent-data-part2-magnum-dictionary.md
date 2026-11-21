# Данные Шымкента, часть 2: словарь и таксономия Magnum — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Словарь Шымкента с карточками всех товаров Magnum публикуемых категорий, собранный субагентами Haiku через обобщённый `store-match`, и миграция таксономии с фильтрами из него.

**Architecture:** Детерминированный код готовит батчи и кандидатов (`dict:prepare`), субагент пишет решения с названием и брендом карточки, `dict:apply-decisions` проверяет и добавляет записи, не меняя существующих. LLM-кода в pipeline нет.

**Tech Stack:** TypeScript, zod, vitest; субагенты Haiku (инструмент Agent исполнителя).

**Spec:** `docs/superpowers/specs/2026-11-21-shymkent-data-design.md` (часть 2). Начинается после слияния части 1.

## Global Constraints

- Решение субагента: `{ id, category, match, confidence, displayName, brand }`; `displayName` — непустая строка, `brand` — строка или `null`.
- Размер и жирность карточки — только из исходного названия (`itemAttributes`).
- Батч — 40 товаров; субагент читает только свой `batch-NNN.json` и пишет только свой `batch-NNN.decisions.json`.
- Источник — локальный `data/sources/magnum.json` прогона 2026-11-21; живого скрапа в этой части нет.
- `backend-go/internal/szpt/groups.go` не меняется. Список категорий `CATEGORIES` не меняется.
- В промпте и документах — без города, сети и способа получения данных.
- Ветка `feat/shymkent-magnum-dictionary` от `main`.

## Review Focus

- `displayName` с другим размером («… 1 л» при исходном «… 0,9 л») → карточка получает исходное название, `rejectedName` +1 (тест в задаче 1).
- `displayName` из пробелов или `brand: ""` → решение невалидно (`--check` падает) или бренд `null` соответственно (тест в задаче 1).
- Повторный `dict:prepare MAGNUM` после применения → 0 товаров (тест в задаче 2).
- Батч без файла решений или с лишним/пропущенным `id` → `--check` выходит с кодом 1 и называет батч (тест в задаче 2).
- Весовой товар с весом в `displayName` («Картофель 1 кг» при цене за кг) → вес не попадает в атрибуты (тест в задаче 1).

---

### Task 1: Решение с названием и брендом карточки

**Files:**
- Modify: `pipeline/src/mapping/store-match.ts`
- Test: `pipeline/test/store-match.test.ts`

**Interfaces:**
- Produces: `MatchDecisionSchema` с `displayName: z.string().trim().min(1)`, `brand: z.string().trim().nullable()` (пустая строка → `null`); `ApplyStats.rejectedName: number`; `applyDecisions(base, store, items, decisions)` — прежняя сигнатура.

- [ ] **Step 1: Failing tests:** новая карточка: `name === displayName`, `brand` из решения; `displayName` «Молоко Бренд 3.2% 1 л» при исходном «МОЛОКО БРЕНД 3,2% 900МЛ» → `name` = исходное, `rejectedName === 1`; `brand: ""` → `null`; `displayName: "  "` → `validateDecisions` не `null`; весовой товар (`weighted: true`) «Картофель» с `displayName` «Картофель 1 кг» → `name` = «Картофель», атрибуты пустые, `rejectedName === 1`; штучный товар без размера в исходном названии с `displayName` «Соль 1 кг» → имя принято (конфликта нет). Присоединение к кандидату не меняет имя существующей карточки.
- [ ] **Step 2:** `pnpm vitest run test/store-match.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать: `MatchItem` получает `weighted: boolean`; правило имени — отвергнуть `displayName`, если у него размер/жирность противоречат исходным или если товар весовой и в `displayName` есть размер.
- [ ] **Step 4:** тест → PASS. **Commit** `git commit -m "Let match decisions name and brand new dictionary cards"`.

### Task 2: Общие CLI `dict:prepare` / `dict:apply-decisions` и промпт

**Files:**
- Create: `pipeline/src/cli/dict-prepare.ts`, `pipeline/src/cli/dict-apply-decisions.ts`
- Modify: `pipeline/src/mapping/store-match-prompt.md`, `pipeline/package.json`
- Test: `pipeline/test/dict-cli.test.ts` (запуск CLI через `tsx` на временном `REPO_ROOT`/`mappingDir`/`sourcesDir`, как другие CLI-тесты в `pipeline/test/`)

**Interfaces:**
- Consumes: `buildCandidates`, `validateDecisions`, `applyDecisions`, `isVariableWeight`, `STORE_CODES`.
- Produces: `pnpm dict:prepare <STORE>` → `data/agent/<store>-match/batch-NNN.json` + `prompt.md`; `pnpm dict:apply-decisions <STORE> [--check]`; код выхода 2 — неверные аргументы/нет файлов, 1 — невалидные батчи.

- [ ] **Step 1: Failing tests:** `dict:prepare MAGNUM` на 3 товарах → 1 батч с `weighted`; `dict:prepare FOO` → exit 2; `--check` без решений → exit 1 и `batch-001.json: missing`; применение валидных решений → словарь содержит 3 товара; повторный `dict:prepare MAGNUM` → «0 items».
- [ ] **Step 2:** `pnpm vitest run test/dict-cli.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать по образцу удалённых `anvar-prepare`/`anvar-apply` (git history `main` до части 1). Промпт: без города и сети; поля `displayName`, `brand`; формат «Тип Бренд характеристики размер»; правило яиц (вид и категория С0/С1/С2/Д0/Д1 из исходного названия; «Яйцо … 1 Категория» → «Яйцо куриное С1 …» только если вид однозначен — иначе без вида); весовые — без размера; бренд — производитель, не сеть.
- [ ] **Step 4:** тест → PASS; `pnpm test`, `pnpm typecheck` → PASS. **Commit** `git commit -m "Add store-agnostic dictionary prepare and apply commands"`.

### Task 3: Сборка словаря Magnum (выполняет агент)

**Files:**
- Modify: `data/mapping/dictionary.json`, `data/mapping/overrides.json`
- Create: `backend/prisma/migrations/<дата-время>_shymkent_taxonomy/migration.sql` (через `pnpm taxonomy:sql`)

- [ ] **Step 1:** Скопировать локальный файл живого прогона `magnum.json` (2026-11-21, вне репозитория) в `data/sources/magnum.json`; `pnpm dict:prepare MAGNUM` → записать число товаров и батчей.
- [ ] **Step 2:** По одному субагенту Haiku (`model: haiku`) на батч, параллельно пачками; промпт субагенту: путь `prompt.md`, путь своего батча, путь своего файла решений, «читать только свой батч, писать только свой файл».
- [ ] **Step 3:** `pnpm dict:apply-decisions MAGNUM --check` → для невалидных батчей повторить субагента (до 2 раз; дальше — разобрать вручную) → exit 0.
- [ ] **Step 4:** `pnpm dict:apply-decisions MAGNUM` → записать `ApplyStats`.
- [ ] **Step 5:** Ревью агентом: все карточки `eggs`, `milk`, `dairy` и случайные 10% остальных (сид случайности записать). Неверная категория → `moveCategory` в `overrides.json` + `pnpm dict:apply`. Неверное название — исправить решение в батче и переприменить на копии словаря до коммита.
- [ ] **Step 6:** Приблизительная проверка СЗПТ: для каждой группы `groups.go` применить `Include`/`Exclude` (регистронезависимо) к `name` карточек её `Category`, учесть `MinSize` и жирность; одноразовый скрипт в scratchpad. Ожидание: `eggs` > 0; список пустых групп — в отчёт (ожидаемо `fish`).
- [ ] **Step 7:** `pnpm taxonomy:sql` → новая миграция таксономии; `pnpm test` (`taxonomy.test.ts` сверяет её) → PASS.
- [ ] **Step 8: Commit** `git commit -m "Build the Shymkent dictionary for Magnum"`.

### Task 4: Отчёт и CI

**Files:**
- Create: `docs/production/reports/SHYMKENT_MAGNUM_DICTIONARY_REPORT.md`

- [ ] **Step 1:** Локальный CI `pipeline,schema,security,guard` → PASS.
- [ ] **Step 2:** Отчёт: число товаров/карточек, `ApplyStats`, итоги ревью (сколько исправлено и как), группы СЗПТ с числом карточек, проверки PASS/FAIL/SKIP/NOT_RUN, риски.
- [ ] **Step 3: Commit** `git commit -m "Report the Magnum dictionary"`. Push и PR — после «да» Owner.
