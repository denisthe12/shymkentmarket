# Gramad, часть 2: словарь и сеть в реестре — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Строка `GRAMAD` в `stores`, правило веса для двух сетей и словарь Шымкента, покрывающий товары Gramad: присоединения к карточкам Magnum по штрихкоду и решениями субагентов, остальное — новые карточки.

**Architecture:** Одна новая миграция (строка `stores` + пересоздание `offer_price_basis`) меняется вместе с `weight.ts` и `offer_price_basis_check.sql`. `dict:prepare` детерминированно находит пары по EAN-13 и пишет их рядом с батчами; `dict:apply-decisions` применяет пары и решения; присоединение весового товара к штучной карточке запрещено кодом.

**Tech Stack:** TypeScript, zod, vitest; SQL (PostgreSQL 17, Prisma migrate); Go-тест (минимальная правка); субагенты Haiku.

**Spec:** `docs/superpowers/specs/2026-11-22-gramad-network-design.md` (часть 2). Начинается после слияния части 1.

## Global Constraints

- Правило веса во всех трёх местах: `storeCode ∈ {MAGNUM, GRAMAD}` и `rawPayload.isWeighted === true`; `basisGrams` 1000; неизвестная сеть — не весовая.
- Строка `stores`: новый UUID, `code 'GRAMAD'`, `name 'Gramad'`, `"logoUrl" NULL`, `"sortOrder" 20`, без `store_locations`.
- Существующие миграции не меняются; новые — дописать в цепочку `scripts/ci/postgres.mjs` и в список «не допускается автотранспортом» `scripts/deploy/auto-gate.test.mjs`; allowlist не трогать. Миграция таксономии — только `pnpm taxonomy:sql`.
- Зона Backend 1 — только `backend-go/internal/ingestion/identity_integration_test.go` и `backend-go/scripts/local-ingest-db.sh` (решение Owner). Любой другой падающий файл `backend-go/` — стоп и вопрос Owner.
- Индекс штрихкодов: только ровно 13 цифр, без префикса `20`–`29`.
- Пара по штрихкоду: штрихкод ведёт ровно к одной карточке; в карточке нет товара этой сети; нет `sizeConflict`; ни товар, ни карточка не весовые.
- Решение субагента прежнее: `{ id, category, match, confidence, displayName, brand }`; батч 40; субагент читает только свой батч и пишет только свой файл решений.
- Источники — локальные `data/sources/gramad.json` (прогон части 1) и `data/sources/magnum.json` (последний прогон); нового живого скрапа нет. `data/sources/`, `data/agent/` не коммитить.
- Записи в БД — только в проверенную одноразовую локальную PostgreSQL (локальный CI так и делает).
- Ветка от `origin/main` после слияния части 1, отдельный worktree; push, PR, merge — после «да» Owner.

## Review Focus

- Штрихкод Gramad ведёт к двум карточкам Magnum → пары нет, товар уходит субагенту, счётчик `barcodeAmbiguous` (тест в задаче 3).
- Субагент присоединил «РИС ПРОПАРЕННЫЙ КГ» (весовой) к штучной карточке «Рис … 800 гр» с уверенностью 0,98 → новая карточка, `rejectedWeight` +1 (тест в задаче 2).
- Повторный `dict:prepare GRAMAD` после применения → 0 товаров и 0 пар (тест в задаче 3).
- Нет `data/sources/magnum.json`, а в словаре есть товары `MAGNUM:` → `dict:prepare GRAMAD` выходит с кодом 2 и называет файл (тест в задаче 3).
- Бандл только с `MAGNUM` после новой миграции → ingest отказывает (`required_source_missing` или `ingestion stores mismatch`) — ожидаемо; `SYNC_STORES` по умолчанию `MAGNUM,GRAMAD` (тест в задаче 1, проверка в части 3).

---

### Task 1: Gramad в реестре и правило веса

**Files:**
- Create: `backend/prisma/migrations/<YYYYMMDDHHMMSS>_shymkent_gramad_store/migration.sql` (метка позже последней миграции)
- Modify: `pipeline/src/mapping/weight.ts`, `ops/postgres/szpt/offer_price_basis_check.sql`, `scripts/ci/postgres.mjs`, `scripts/deploy/auto-gate.test.mjs`, `backend-go/scripts/local-ingest-db.sh`, `backend-go/internal/ingestion/identity_integration_test.go`, `pipeline/src/cli/sync.ts`, `pipeline/scripts/daily-sync.sh` (`STORES=(magnum gramad)`), `ops/sync/aktau-sync.env.example`, `ops/sync/README.md`, `docs/data/SYNC_RUNBOOK.md`
- Test: `pipeline/test/weight.test.ts`, `pipeline/test/daily-sync-stores.test.ts`

**Interfaces:**
- Produces: `isVariableWeight(storeCode, product)` — `true` для `MAGNUM` и `GRAMAD` с `rawPayload.isWeighted === true`; строка `GRAMAD` в `stores` после `prisma migrate deploy`.

- [ ] **Step 1: Failing tests:** `weight.test.ts` — `GRAMAD` с `isWeighted: true` → `true`; `GRAMAD` без флага, с `priceUnit: 'kg'` без флага, с названием «КАРТОФЕЛЬ КГ» без флага → `false`; `STORE_A` с флагом → `false` (как сейчас). `daily-sync-stores.test.ts` — `STORES` = `['magnum', 'gramad']`; `sync.ts` содержит `'MAGNUM,GRAMAD'`; env-пример `^SYNC_STORES=MAGNUM,GRAMAD$`.
- [ ] **Step 2:** `pnpm vitest run test/weight.test.ts test/daily-sync-stores.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать pipeline-часть и документы (`SYNC_RUNBOOK.md`, `ops/sync/README.md` — две сети; без описания доступа к источнику).
- [ ] **Step 4:** Миграция: `BEGIN`; `lock_timeout`/`statement_timeout` как в базовой; та же охранная проверка RLS, что перед `CREATE VIEW` в базовой миграции; `INSERT INTO public.stores …`; `CREATE OR REPLACE VIEW public.offer_price_basis` с `WHEN 'MAGNUM', 'GRAMAD' THEN coalesce(r."rawPayload"->>'isWeighted' = 'true', false)` (список и порядок столбцов прежние); повтор `REVOKE`/`GRANT` как в базовой; комментарий «Rule = pipeline/src/mapping/weight.ts»; `COMMIT`. `offer_price_basis_check.sql`: то же правило в `:basis_cte`, ссылка «latest migration defining the view» — на новую; STOP-условие «MAGNUM has 0 weighted» дополнить так же для `GRAMAD`, если у сети есть предложения в снимке.
- [ ] **Step 5:** Цепочка: `postgres.mjs` — добавить имя миграции в ожидаемую строку; `auto-gate.test.mjs` — в массив миграций, которые не допускаются; `local-ingest-db.sh` — применять `*_shymkent_gramad_store` после миграций таксономии (порядок по имени). `identity_integration_test.go` — в подготовке теста `DELETE FROM stores WHERE code='GRAMAD'` перед `seedStores` с комментарием «набор сетей теста задаёт сам тест»; утверждения теста не менять.
- [ ] **Step 6:** `pnpm test`, `pnpm typecheck`, `node --test scripts/deploy/auto-gate.test.mjs` → PASS. Локальный CI `go,schema,ops,postgres,staging` → PASS. Если падает другой файл `backend-go/` — стоп, вопрос Owner с именем теста и причиной.
- [ ] **Step 7: Commit** `git commit -m "Register Gramad and price its loose goods per kg"`.

### Task 2: Весовой признак при присоединении и правило про названия источника

**Files:**
- Create: `pipeline/src/mapping/card-weight.ts`
- Modify: `pipeline/src/mapping/store-match.ts`, `pipeline/src/mapping/store-match-prompt.md`
- Test: `pipeline/test/store-match.test.ts`, `pipeline/test/card-weight.test.ts`

**Interfaces:**
- Consumes: `isVariableWeight` (задача 1).
- Produces: `weightedCardKeys(dict: Dictionary, sources: SourceFile[]): Set<string>` — карточка весовая, если весовой хотя бы один её товар по файлам источников;
  `MatchCandidate.weighted: boolean`;
  `buildCandidates(dict, name, scope, k = 8, weightedCards: ReadonlySet<string> = new Set())`;
  `ApplyStats.rejectedWeight: number`.

- [ ] **Step 1: Failing tests:** `card-weight.test.ts` — карточка с весовым товаром Magnum → в наборе; товар без файла источника — не весовой. `store-match.test.ts` — кандидат получает `weighted` из набора; `applyDecisions`: весовой товар → штучный кандидат с уверенностью 0,98 → новая карточка, `rejectedWeight` 1, `attached` 0; штучный → весовой кандидат — то же; совпадающий признак — присоединение как раньше.
- [ ] **Step 2:** `pnpm vitest run test/store-match.test.ts test/card-weight.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать; проверка веса — до `sizeConflict`, по `candidate.weighted !== item.weighted`. Промпт: «Названия источника бывают заглавными буквами и с сокращениями упаковки („ТВА“, „П/Б“, „СТ“); `displayName` — обычным регистром, без сокращений упаковки»; описание входа — у кандидата есть `weighted`.
- [ ] **Step 4:** тесты → PASS; `pnpm test`, `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Refuse to attach loose goods to packaged cards and back"`.

### Task 3: Пары по штрихкоду в dict:prepare и dict:apply-decisions

**Files:**
- Create: `pipeline/src/mapping/barcode-match.ts`
- Modify: `pipeline/src/cli/dict-prepare.ts`, `pipeline/src/cli/dict-apply-decisions.ts`, `pipeline/src/cli/dict-seed-categories.ts` (аргумент сети)
- Test: `pipeline/test/barcode-match.test.ts`, `pipeline/test/dict-cli.test.ts`

**Interfaces:**
- Consumes: `weightedCardKeys`, `buildCandidates` (задача 2); `GRAMAD_SCOPE` (часть 1).
- Produces:
  `type BarcodePair = { id: string; name: string; barcode: string; card: string }`;
  `type BarcodeStats = { barcodeAttached: number; barcodeAmbiguous: number; barcodeRejectedSize: number; barcodeRejectedWeight: number; barcodeSameStore: number }`;
  `buildBarcodeIndex(dict: Dictionary, sources: SourceFile[]): Map<string, string[]>` (штрихкод → отсортированные ключи карточек; у Magnum штрихкоды из `rawPayload.barcodes`, у Gramad — `rawPayload.barcode`);
  `findBarcodePairs(dict: Dictionary, store: StoreCode, products: SourceProduct[], index: Map<string, string[]>, weightedCards: ReadonlySet<string>): { pairs: BarcodePair[]; stats: BarcodeStats }`;
  `applyBarcodePairs(base: Dictionary, store: StoreCode, pairs: BarcodePair[]): { dict: Dictionary; attached: number }` (повторно проверяет размер и «нет товара этой сети в карточке»; уже внесённый `id` — ошибка);
  файл `data/agent/<store>-match/barcode-pairs.json`; `pnpm dict:seed-categories <STORE>`.

- [ ] **Step 1: Failing tests:** `barcode-match.test.ts` — штрихкод `2900800020254` и 12-значный не попадают в индекс; один штрихкод → одна карточка → пара; → две карточки → нет пары, `barcodeAmbiguous` 1; размер противоречит → `barcodeRejectedSize`; весовая карточка → `barcodeRejectedWeight`; в карточке уже есть товар этой сети → `barcodeSameStore`; `applyBarcodePairs` добавляет `products[id] = card` и не меняет карточку. `dict-cli.test.ts` (временный `REPO_ROOT`, синтетические `magnum.json` и `gramad.json`) — `dict:prepare GRAMAD`: товар с общим EAN попадает в `barcode-pairs.json`, а не в батч; нет `magnum.json` при товарах `MAGNUM:` в словаре → код 2 и имя файла; `dict:apply-decisions GRAMAD --check` проверяет и пары; применение → словарь содержит пары и решения; повторный `dict:prepare GRAMAD` → 0 товаров, 0 пар; `dict:seed-categories GRAMAD` добавляет ключи `GRAMAD|…` из `GRAMAD_SCOPE`, существующие не меняет.
- [ ] **Step 2:** `pnpm vitest run test/barcode-match.test.ts test/dict-cli.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать. `dict:prepare <STORE>`: файлы источников других сетей, у которых есть товары в `dictionary.products`, обязательны; пары → `barcode-pairs.json`; оставшиеся товары → батчи с кандидатами, у которых `weighted`; в лог — `BarcodeStats`. `--force` удаляет и `barcode-pairs.json`. `dict:apply-decisions`: сначала `applyBarcodePairs`, затем `applyDecisions`; в лог — обе статистики.
- [ ] **Step 4:** тесты → PASS; `pnpm test`, `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Attach products to existing cards by shared barcodes"`.

### Task 4: Сборка словаря Gramad (выполняет оркестратор: субагенты Haiku)

**Files:**
- Modify: `data/mapping/dictionary.json`, `data/mapping/overrides.json`
- Create (если фильтры изменились): `backend/prisma/migrations/<дата-время>_shymkent_taxonomy/migration.sql` через `pnpm taxonomy:sql`; тогда же `scripts/ci/postgres.mjs`, `scripts/deploy/auto-gate.test.mjs`, порядок в `local-ingest-db.sh` проверить

- [ ] **Step 1:** Скопировать локальные `gramad.json` и `magnum.json` в `data/sources/` этого worktree. `pnpm dict:seed-categories GRAMAD`.
- [ ] **Step 2:** `pnpm dict:prepare GRAMAD` → записать: товаров, пар по штрихкоду, `BarcodeStats`, батчей, товаров без кандидатов.
- [ ] **Step 3:** По одному субагенту Haiku (`model: haiku`) на батч, пачками параллельно; в промпте — путь `prompt.md`, путь своего батча и своего файла решений, «читать только свой батч, писать только свой файл».
- [ ] **Step 4:** `pnpm dict:apply-decisions GRAMAD --check` → невалидные батчи — повтор субагента (до 2 раз, затем разбор вручную) → exit 0. Копия словаря до применения (для переприменения после ревью).
- [ ] **Step 5:** `pnpm dict:apply-decisions GRAMAD` → записать статистику; `pnpm dict:apply`.
- [ ] **Step 6: Ревью:** все присоединения субагентов к карточкам Magnum; случайные 10% пар по штрихкоду; все новые карточки `eggs`, `milk`; случайные 10% остальных новых (сид и генератор записать). Ошибочное присоединение или название — правка решения и переприменение от копии; категория — `moveCategory` + `pnpm dict:apply`.
- [ ] **Step 7:** Приблизительная проверка СЗПТ (одноразовый скрипт в scratchpad, правила `groups.go`): по каждой группе — карточек всего и с товаром Gramad.
- [ ] **Step 8:** `pnpm taxonomy:sql` → «no taxonomy change» или новая миграция (тогда цепочка и список автотранспорта); `pnpm test` → PASS.
- [ ] **Step 9: Commit** `git commit -m "Add Gramad to the Shymkent dictionary"`.

### Task 5: Отчёт и CI

**Files:**
- Create: `docs/production/reports/SHYMKENT_GRAMAD_DICTIONARY_REPORT.md`

- [ ] **Step 1:** Локальный CI `MSYS_NO_PATHCONV=1 node <локальный CI>/run-local.mjs pipeline,schema,security,guard,ops,go,postgres,staging` (в фоне) → PASS.
- [ ] **Step 2:** Отчёт по образцу `SHYMKENT_MAGNUM_DICTIONARY_REPORT.md`: файлы, миграции, статистика пар и решений (`BarcodeStats`, `ApplyStats` с `rejectedWeight`), ревью (сколько проверено и исправлено), группы СЗПТ с Gramad, правки зоны Backend 1, PASS/FAIL/SKIP/NOT_RUN, риски. **Commit** `git commit -m "Report the Gramad dictionary"`. Push и PR — после «да» Owner.
