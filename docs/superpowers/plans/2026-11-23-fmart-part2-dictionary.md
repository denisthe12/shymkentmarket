# F-Mart, часть 2: словарь и сеть в реестре — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Строка `FMART` в `stores`, правило веса для трёх сетей и словарь, покрывающий товары F-Mart; хвосты Gramad закрыты до присоединения F-Mart.

**Architecture:** Одна новая миграция (строка `stores` + пересоздание `offer_price_basis`) меняется вместе с `weight.ts` и `offer_price_basis_check.sql`. Код присоединения (`barcode-match.ts`, `store-match.ts`, `dict:prepare`, `dict:apply-decisions`) общий и не меняется; меняется только промпт. Всё — одним PR: строка сети без словаря сломала бы синхронизацию двух сетей.

**Tech Stack:** TypeScript, vitest; SQL (PostgreSQL 17, Prisma migrate); Go-тест (минимальная правка); субагенты Haiku.

**Spec:** `docs/superpowers/specs/2026-11-23-fmart-network-design.md` (часть 2). Начинается после слияния части 1.

## Global Constraints

- Правило веса во всех местах: `storeCode ∈ {MAGNUM, GRAMAD, FMART}` и `rawPayload.isWeighted === true`; `basisGrams` 1000; неизвестная сеть — не весовая.
- Строка `stores`: новый UUID, `code 'FMART'`, `name 'F-Mart'`, `"logoUrl" NULL`, `"sortOrder" 30`, без `store_locations`.
- Существующие миграции не меняются; новые — в цепочку `scripts/ci/postgres.mjs` и в список «не допускается автотранспортом» `scripts/deploy/auto-gate.test.mjs`; allowlist не трогать. Таксономия — только `pnpm taxonomy:sql`.
- Зона Backend 1 — только `backend-go/internal/ingestion/identity_integration_test.go` и `backend-go/scripts/local-ingest-db.sh`. Любой другой падающий файл `backend-go/` — стоп и вопрос Owner.
- Источники — локальные `magnum.json`, `gramad.json` (полная выдача, около 590), `fmart.json` (прогон части 1); пути в сообщении запуска. Нового живого скрапа нет. `data/sources/`, `data/agent/` не коммитить.
- `dict:prepare --force` удаляет файлы решений: перед ним — копия `data/agent/<сеть>-match` вне git.
- Существующие карточки Magnum и Gramad не сливаются. «1 сорт» яиц не переписывается в «С1».
- Решение субагента прежнее: `{ id, category, match, confidence, displayName, brand }`; батч 40; субагент читает только свой батч и пишет только свой файл решений.
- Записи в БД — только в одноразовую локальную PostgreSQL. Ветка `feat/fmart-dictionary` от `origin/main` после слияния части 1; push, PR, merge — после «да».

## Review Focus

- Штрихкод F-Mart ведёт к карточке Magnum и к отдельной карточке Gramad → пары нет, `barcodeAmbiguous`, карточки не слились (тест в задаче 2).
- F-Mart присоединён к карточке, которая была `pending` → в бандле пара цела, не разведена (тест в задаче 3).
- «Картошка» F-Mart получила `displayName` «Картофель», весовая, без размера → попадает в группу «Картофель» (проверка в задаче 4).
- «Яйцо Аймар кус 1 сорт 30 шт» не стало «С1» (проверка в задаче 4).
- Бандл только с `MAGNUM,GRAMAD` после миграции → ingest отказывает; `SYNC_STORES` по умолчанию — три сети (тест в задаче 1, прогон в части 3).

---

### Task 1: F-Mart в реестре и правило веса

**Files:**
- Create: `backend/prisma/migrations/<YYYYMMDDHHMMSS>_shymkent_fmart_store/migration.sql` (метка позже последней миграции)
- Modify: `pipeline/src/mapping/weight.ts`, `ops/postgres/szpt/offer_price_basis_check.sql`, `scripts/ci/postgres.mjs`, `scripts/deploy/auto-gate.test.mjs`, `backend-go/scripts/local-ingest-db.sh`, `backend-go/internal/ingestion/identity_integration_test.go`, `pipeline/src/cli/sync.ts`, `pipeline/scripts/daily-sync.sh`, `scripts/ops/daily-sync.test.mjs`, `ops/sync/aktau-sync.env.example`, `ops/sync/README.md`, `docs/data/SYNC_RUNBOOK.md`, комментарий `pipeline/src/mapping/barcode-match.ts:24`
- Test: `pipeline/test/weight.test.ts`, `pipeline/test/daily-sync-stores.test.ts`

**Interfaces:**
- Produces: `isVariableWeight(storeCode, product)` — `true` для трёх сетей с `rawPayload.isWeighted === true`; строка `FMART` после `prisma migrate deploy`; `SYNC_STORES` по умолчанию `MAGNUM,GRAMAD,FMART`.

- [ ] **Step 1: Failing tests:** `weight.test.ts` — `FMART` с `isWeighted: true` → `true`; без флага, с `priceUnit: 'kg'` без флага, с `weightSource: 'fresh500'` без флага → `false`; `STORE_A` с флагом → `false`. `daily-sync-stores.test.ts` — `['magnum', 'gramad', 'fmart']`; `'MAGNUM,GRAMAD,FMART'`; `^SYNC_STORES=MAGNUM,GRAMAD,FMART$`. `daily-sync.test.mjs` — список сетей в цикле, `ALL`, `all-failed` (`scrape:magnum,scrape:gramad,scrape:fmart`), ожидаемые `stores` в `success`, `one-chain-failed` (`{magnum:0,gramad:1,fmart:0}`) и в тесте `SIGKILL` (`{magnum:null,gramad:null,fmart:null}`).
- [ ] **Step 2:** `pnpm vitest run test/weight.test.ts test/daily-sync-stores.test.ts` → FAIL. (`daily-sync.test.mjs` — только в Docker, в шаге 6.)
- [ ] **Step 3:** Реализовать pipeline-часть и документы (три сети, без доступа к источнику).
- [ ] **Step 4:** Миграция — по образцу `20261122210000_shymkent_gramad_store`: `BEGIN`, таймауты, `INSERT`, охранная проверка RLS, `CREATE OR REPLACE VIEW` с `s.code IN ('MAGNUM', 'GRAMAD', 'FMART')`, `REVOKE`/`GRANT`, `COMMIT`. `offer_price_basis_check.sql`: то же правило в `basis_cte`, ссылка на новую миграцию, `('FMART', false)` в `VALUES`, текст STOP-условия и комментарий.
- [ ] **Step 5:** `postgres.mjs` — имя в цепочку; `auto-gate.test.mjs` — в массив недопускаемых; `local-ingest-db.sh` — после `gramad_store` применять `*_shymkent_fmart_store`; `identity_integration_test.go` — `DELETE FROM stores WHERE code IN ('GRAMAD','FMART')`, утверждения не менять.
- [ ] **Step 6:** `pnpm test`, `pnpm typecheck`, `node --test scripts/deploy/auto-gate.test.mjs` → PASS. Локальный CI `go,schema,ops,postgres,staging` → PASS. Другой падающий файл `backend-go/` — стоп и вопрос.
- [ ] **Step 7: Commit** `git commit -m "Register F-Mart and price its weighted goods per kg"`.

### Task 2: Промпт и защита присоединения

**Files:**
- Modify: `pipeline/src/mapping/store-match-prompt.md`
- Test: `pipeline/test/barcode-match.test.ts`, `pipeline/test/dict-cli.test.ts`

**Interfaces:**
- Consumes: `findBarcodePairs`, `dict:prepare <STORE>` (без изменений кода).

- [ ] **Step 1: Tests (код уже общий, фиксируют поведение):** `barcode-match.test.ts` — для `FMART` с `rawPayload.barcode`: одна карточка → пара; карточки Magnum и Gramad разные с одним штрихкодом → `barcodeAmbiguous` 1, пары нет; код `2500100001528` → не в индексе; весовой F-Mart → `barcodeRejectedWeight`. `dict-cli.test.ts` — `dict:prepare FMART` при товарах `MAGNUM:` и `GRAMAD:` в словаре требует оба файла, нет любого → код 2 и имя файла; `dict:seed-categories FMART` добавляет ключи `FMART|…` из `FMART_SCOPE`, существующие не меняет.
- [ ] **Step 2:** `pnpm vitest run test/barcode-match.test.ts test/dict-cli.test.ts` → PASS; красный тест означает дефект общего кода — исправить с тестом.
- [ ] **Step 3:** Промпт: в раздел `displayName` добавить: «Не пиши страну происхождения, слово „весовой“ и казахский перевод названия. Весовые овощи называй по товару: „Картошка“ → „Картофель“, „Лук“ → „Лук репчатый“, „Капуста“ → „Капуста белокочанная“, если это ровно этот товар.» и «Яйца: „1 сорт“, „2 сорт“ источника оставляй как есть, не превращай в С1 и С2.» Если есть тест промпта — обновить.
- [ ] **Step 4:** `pnpm test` → PASS. **Commit** `git commit -m "Tell the matching prompt how F-Mart names its goods"`.

### Task 3: Хвосты Gramad (оркестратор)

**Files:**
- Modify: `data/mapping/dictionary.json`, `data/mapping/overrides.json`
- Test: `pipeline/test/publish.test.ts` (или существующий тест `isolateForPublish`)

- [ ] **Step 1:** Скопировать три файла источников в `data/sources/` worktree; `pnpm dict:prepare GRAMAD` → ожидается около 5 товаров; субагент(ы) Haiku → `--check` → применение → `pnpm dict:apply`.
- [ ] **Step 2:** Ревью 9 карточек `review: pending` (Картофель, Томаты тепличные, Баклажан Ташкент, Сыр Эмир ×2, Сахар рафинад Nefis, Чай Champion, Сметана Аяла, Сметана Иртыш): название, категория, размер. Верные — `overrides.approve` с причиной; неверные категории — `moveCategory`; спорные — список Owner. Слияния с карточками Magnum нет.
- [ ] **Step 3: Failing test:** карточка `approved` с участниками двух сетей публикуется одной группой; та же `pending` — разводится (если такого теста ещё нет).
- [ ] **Step 4:** `pnpm dict:apply`; `pnpm test` → PASS; pending Gramad 0 или только спорные из списка Owner.
- [ ] **Step 5: Commit** `git commit -m "Settle the pending Gramad cards"`.

### Task 4: Сборка словаря F-Mart (оркестратор: субагенты Haiku)

**Files:**
- Modify: `data/mapping/dictionary.json`, `data/mapping/overrides.json`
- Create (если фильтры изменились): миграция таксономии через `pnpm taxonomy:sql`; тогда же `scripts/ci/postgres.mjs` и `scripts/deploy/auto-gate.test.mjs`

- [ ] **Step 1:** `pnpm dict:seed-categories FMART`; `pnpm dict:prepare FMART` → записать товаров, пар, `BarcodeStats`, батчей, без кандидатов.
- [ ] **Step 2:** По одному субагенту Haiku (`model: haiku`) на батч, пачками; в промпте — путь `prompt.md`, свой батч, свой файл решений.
- [ ] **Step 3:** `pnpm dict:apply-decisions FMART --check`; невалидные батчи — повтор субагента до 2 раз, затем вручную. Копия словаря до применения.
- [ ] **Step 4:** `pnpm dict:apply-decisions FMART` → статистика; `pnpm dict:apply`.
- [ ] **Step 5: Ревью:** все присоединения субагентов к карточкам; случайные 10% пар по штрихкоду; все новые `eggs`, `milk`; все свежие весовые; все присоединения, где размера нет с обеих сторон; новые pending F-Mart; 10% остальных новых (сид записать). «Свежевыжатый сок» и подобное — не `vegetables`. Ошибка — правка решения и переприменение от копии; категория — `moveCategory`.
- [ ] **Step 6:** Проверки: у карточек с весовым F-Mart нет `weightGrams` и `volumeMl`; «1 сорт» не стал «С1»; «Нарлен 1 сорт 30 шт» в карточке «Нарлен С1 30 шт» (пара по штрихкоду); «Картофель», «Лук репчатый», «Морковь», «Капуста белокочанная» есть у F-Mart.
- [ ] **Step 7:** Приблизительная проверка СЗПТ (скрипт в scratchpad, правила `groups.go`): по группе — карточек, с Gramad, с F-Mart, с тремя сетями; сравнить с числами отчёта Gramad.
- [ ] **Step 8:** `pnpm taxonomy:sql` → «no taxonomy change» или новая миграция (цепочка и список автотранспорта); `pnpm test` → PASS.
- [ ] **Step 9: Commit** `git commit -m "Add F-Mart to the Shymkent dictionary"`.

### Task 5: Отчёт и CI

**Files:**
- Create: `docs/production/reports/SHYMKENT_FMART_DICTIONARY_REPORT.md`

- [ ] **Step 1:** Локальный CI `MSYS_NO_PATHCONV=1 node <локальный CI>/run-local.mjs pipeline,schema,security,guard,ops,go,postgres,staging` (в фоне) → PASS.
- [ ] **Step 2:** Отчёт по образцу `SHYMKENT_GRAMAD_DICTIONARY_REPORT.md`: миграции, статистика, ревью, хвосты Gramad, СЗПТ, правки зоны Backend 1, PASS/FAIL/SKIP/NOT_RUN, риски. **Commit** `git commit -m "Report the F-Mart dictionary"`. Push и PR — после «да».
