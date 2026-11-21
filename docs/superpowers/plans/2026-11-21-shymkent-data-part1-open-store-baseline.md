# Данные Шымкента, часть 1: открытый код сети, новая база, без Актау — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Код сети становится открытой строкой, двенадцать унаследованных миграций заменяет одна база Шымкента, сети Актау и их данные/документы удалены, Magnum доходит до снимка через Go ingest.

**Architecture:** Список сетей — строки `public.stores` (`code text` с CHECK, `sortOrder`). Pipeline знает только свои модули (`MAGNUM`); Go проверяет формат кода при разборе бандла и состав сетей — по таблице `stores`; контракт и фронтенд принимают любой код по шаблону.

**Tech Stack:** TypeScript (pipeline, vitest, zod), Go (pgx), PostgreSQL 16 + Prisma migrations, Next.js (frontend, vitest), OpenAPI (redocly), Node 24, pnpm 10.32.1.

**Spec:** `docs/superpowers/specs/2026-11-21-shymkent-data-design.md` (часть 1).

## Global Constraints

- Шаблон кода сети везде один: `^[A-Z][A-Z0-9_]{1,31}$`.
- Строка Magnum: `code 'MAGNUM'`, `name 'Magnum'`, `"logoUrl" NULL`, `"sortOrder" 10`, без `store_locations`.
- `stores."sortOrder" integer NOT NULL DEFAULT 100`.
- Весовой Magnum: `rawPayload.isWeighted === true`; в SQL `coalesce(r."rawPayload"->>'isWeighted' = 'true', false)`, `basisGrams` 1000.
- Имена ролей `aktau_*`, systemd-юниты `ops/sync/aktau-sync*`, пакет `adilbaga-pipeline` и модуль Go `adilbaga/backend-go` — не переименовывать.
- Синтетические сети в тестах: `STORE_A`, `STORE_B` (и `MAGNUM`). Реальные названия других сетей Шымкента не использовать.
- Новые миграции в allowlist автотранспорта (`scripts/deploy/auto-transport.mjs`) не добавлять.
- Публичный репозиторий: в коде, документах, коммитах — ни слова о способе получения данных источников.
- Записи в БД — только в проверенную одноразовую локальную PostgreSQL. Push/PR — только с «да» Owner.
- Ветка `feat/shymkent-data-baseline` от `main`; коммиты по задачам.

## Review Focus

- Бандл с кодом сети, которой нет в `stores` → ingest отвергает с явной ошибкой, снимок не создаётся (тест в задаче 6).
- В `stores` есть сеть, которой нет в бандле → ingest отвергает (прежняя семантика «все сети обязательны»; тест в задаче 6).
- Код сети `magnum`, `M`, `MAGNUM-1`, 33 символа → отвергается CHECK в БД, `Decode` в Go и метрикой (тесты в задачах 2, 6).
- Сеть не из `IMAGE_ORDER` не перебивает картинку `MAGNUM` в группе (тест в задаче 3).
- Охрана миграций: удаление другого каталога или правка базы после слияния → CI падает (тест в задаче 1).

---

### Task 1: Разовое исключение в охране неизменности миграций

**Files:**
- Create: `scripts/ci/migration-guard.mjs`
- Create: `scripts/ci/migration-guard.test.mjs`
- Modify: `scripts/ci/check-source.mjs:32-37`

**Interfaces:**
- Produces: `export const SHYMKENT_BASELINE = '20261122000000_shymkent_baseline'`, `export const REPLACED_MIGRATIONS: readonly string[]` (двенадцать имён каталогов из `backend/prisma/migrations/` на `main`, по порядку), `export function migrationDiffProblem(nameStatusLines: string[]): string | null`.

- [ ] **Step 1: Write the failing test** `scripts/ci/migration-guard.test.mjs` (`node:test`, `assert/strict`):
  - только `A\t…/<новая>/migration.sql` → `null`;
  - удаление всех двенадцати `D\tbackend/prisma/migrations/<имя>/migration.sql` + `A\t…/20261122000000_shymkent_baseline/migration.sql` → `null`;
  - то же без строки `A` базы → строка с `baseline`;
  - удаление одиннадцати из двенадцати + база → не `null`;
  - `D` каталога не из списка → `'existing migration modified/deleted'`;
  - `M\t…/20261122000000_shymkent_baseline/migration.sql` → не `null`;
  - `D\tbackend/prisma/migrations/migration_lock.toml` → не `null`.
- [ ] **Step 2:** `node --test scripts/ci/migration-guard.test.mjs` → FAIL (модуль не найден).
- [ ] **Step 3: Implement** `migrationDiffProblem` — разрешены строки `A\t`; строки `D\t` разрешены, только если множество удалённых каталогов ровно `REPLACED_MIGRATIONS` и среди добавленных есть `SHYMKENT_BASELINE`. В `check-source.mjs` заменить цикл `assert.match(line, /^A\t/…)` на `assert.equal(migrationDiffProblem(lines), null, …)`.
- [ ] **Step 4:** `node --test scripts/ci/migration-guard.test.mjs` → PASS; `node scripts/ci/check-source.mjs` → `source/security policy PASS`.
- [ ] **Step 5:** проверить, что `scripts/ci/run-checks.mjs` запускает тесты `scripts/ci/*.test.mjs` (группа `security` или `ops`); если нет — добавить новый тест туда же, где запускается `guard.test.mjs`.
- [ ] **Step 6: Commit** `git commit -m "Allow the one-time Shymkent migration baseline in the CI guard"`.

### Task 2: Базовая миграция Шымкента

**Files:**
- Delete: двенадцать каталогов `backend/prisma/migrations/2026*` (список = `REPLACED_MIGRATIONS`)
- Create: `backend/prisma/migrations/20261122000000_shymkent_baseline/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/security/*.sql` (только упоминания сетей Актау, если есть)
- Create (вне репозитория): `<scratchpad>/schema-compare/` — дампы и diff для отчёта

**Interfaces:**
- Produces: таблица `public.stores(id text, code text UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]{1,31}$'), name, "logoUrl", "sortOrder" int NOT NULL DEFAULT 100)`; строка Magnum (UUID v4, сгенерировать один раз); представление `public.offer_price_basis` с веткой только `MAGNUM`; `public.categories` пуста.

- [ ] **Step 1:** Поднять одноразовую PostgreSQL (как в `scripts/ci/postgres.mjs` / `run-db-integration.mjs`), проверить `SELECT current_database(), inet_server_addr(), current_user` — это локальный контейнер. Применить двенадцать старых миграций (на `main`) в БД `old`, снять `pg_dump --schema-only --no-owner` + `\dp` + `pg_policies` → `old.sql`.
- [ ] **Step 2:** Собрать `migration.sql` базы: SQL старой цепочки по порядку, затем правки из спеки — без `CREATE TYPE "StoreCode"` (все `"StoreCode"` → `text`), CHECK на `stores.code`, `"sortOrder"`, без `INSERT` строк/точек Актау и без таксономии, `offer_price_basis` с веткой `MAGNUM`, `INSERT` строки Magnum. Блоки, требующие вне-транзакционного выполнения, оставить в порядке, который Prisma применяет одним файлом. Комментарий-шапка: «Shymkent baseline; replaces the inherited migration chain».
- [ ] **Step 3:** Применить базу в чистую БД `new`, снять те же дампы → `new.sql`; `diff old.sql new.sql`. Ожидаемо отличаются только: тип `StoreCode`, тип столбцов кода, CHECK, `sortOrder`, текст `offer_price_basis`. Любое другое отличие — исправить базу.
- [ ] **Step 4:** Проверки CHECK в `new`: `INSERT INTO stores(id,code,name) VALUES ('x','magnum','x')` → ошибка CHECK; то же для `M`, `MAGNUM-1`, 33×`A`; `STORE_A` → успех (откатить).
- [ ] **Step 5:** `schema.prisma`: удалить `enum StoreCode`, `code String @unique`, `sortOrder Int @default(100)`; `pnpm prisma validate` в `backend/` → OK.
- [ ] **Step 6:** `node scripts/ci/run-checks.mjs schema` → PASS (если проверка сверяет Prisma со SQL, расхождений нет).
- [ ] **Step 7: Commit** `git commit -m "Replace the inherited migrations with the Shymkent baseline"`.

### Task 3: Pipeline — Magnum в весе, bundle и sync

**Files:**
- Modify: `pipeline/src/mapping/weight.ts`, `pipeline/src/agent/bundle.ts:12-40`, `pipeline/src/cli/sync.ts:13`
- Test: `pipeline/test/weight.test.ts` (создать, если правило сейчас проверяется в другом файле — дописать туда), `pipeline/test/bundle.test.ts`, `pipeline/test/sync.test.ts`

**Interfaces:**
- Produces: `isVariableWeight(storeCode: StoreCode, product)` — `true` только для `MAGNUM` с `rawPayload.isWeighted === true`.

- [ ] **Step 1: Failing tests:** `isVariableWeight('MAGNUM', {name:'Картофель', rawPayload:{isWeighted:true, priceUnit:'kg'}})` → `true`; `{isWeighted:false}` → `false`; `{}` → `false`; название «Сыр вес» без флага → `false`. В `bundle.test.ts`: группа из `STORE_A` с картинкой и `MAGNUM` с картинкой → выбрана картинка `MAGNUM`; сеть не из `IMAGE_ORDER` сортируется после всех известных.
- [ ] **Step 2:** `pnpm vitest run test/weight.test.ts test/bundle.test.ts` (из `pipeline/`) → FAIL.
- [ ] **Step 3:** `weight.ts`: ветки Актау и `DANA_WEIGHT_MARK` удалить, JSDoc — про Magnum и ссылку на базовую миграцию. `bundle.ts`: `IMAGE_ORDER = ['MAGNUM']`, ранг неизвестной сети = `IMAGE_ORDER.length`. `sync.ts`: default `'MAGNUM'`.
- [ ] **Step 4:** те же тесты → PASS.
- [ ] **Step 5: Commit** `git commit -m "Publish Magnum weighted prices and images in the pipeline"`.

### Task 4: Pipeline — удалить сети Актау и путь Gemini

**Files:**
- Delete: `pipeline/src/scrapers/`, `pipeline/src/cli/{anvar-prepare,anvar-apply,dina-scope,dana-scope,classify,match}.ts`, `pipeline/src/mapping/{dina-scope,dana-scope}.ts`, `pipeline/src/agent/{gemini,llm-stats}.ts`, `pipeline/src/{http,pool,scrape-policy}.ts` (если после удаления без импортов), соответствующие тесты и `pipeline/test/fixtures/*` сетей Актау
- Modify: `pipeline/src/types.ts` (`STORE_CODES = ['MAGNUM'] as const`), `pipeline/src/cli/scrape.ts`, `pipeline/src/agent/{classify,match,block}.ts` (оставить только типы и `applyGuards`, которыми пользуются sync/bundle/publish; `block.ts` удалить, если не используется), `pipeline/package.json` (скрипты `scrape:dina|dana|fixprice|anvar`, `agent:*`, `scope:*` убрать), `pipeline/scripts/*.sh` и их тесты
- Modify: оставшиеся тесты из списка с кодами Актау (`dictionary*.test.ts`, `overrides`, `publish`, `scope`, `sync`, `compare`, `salt`, `source-file`, `store-match`) — коды → `MAGNUM`/`STORE_A`/`STORE_B`

**Interfaces:**
- Consumes: задача 3.
- Produces: `StoreCode = 'MAGNUM'` в pipeline; `ClassifiedProduct`, `Cluster`, `Attributes`, `applyGuards` по прежним путям (или новый путь — тогда обновить все импорты).

- [ ] **Step 1:** Удалить файлы, поправить импорты; `pnpm typecheck` → PASS.
- [ ] **Step 2:** Тесты с кодами Актау перевести на `MAGNUM`/синтетические; тесты, проверявшие только удалённый код, удалить вместе с ним. Если тип `StoreCode` слишком узок для синтетических кодов в тестах — тесты используют `as StoreCode`, тип не расширять.
- [ ] **Step 3:** `pnpm test` → PASS; `rg -n "\b(DINA|DANA|FIX_PRICE|ANVAR)\b|Актау|Aktau" pipeline/` → пусто (кроме имени пакета `adilbaga-pipeline`).
- [ ] **Step 4: Commit** `git commit -m "Remove the Aktau store adapters and the Gemini path from the pipeline"`.

### Task 5: Словарь без карточек, storeCategories Magnum, таксономия только добавлением

**Files:**
- Create: `pipeline/src/mapping/magnum-categories.ts`, `pipeline/src/cli/dict-seed-categories.ts`
- Modify: `pipeline/src/mapping/taxonomy-sql.ts`, `pipeline/src/cli/taxonomy-sql.ts`, `pipeline/package.json` (`dict:seed-categories`)
- Delete: `data/mapping/{dictionary.json,dina-scope-categories.json,dana-scope-sections.json}`, `data/snapshots/*`
- Create: `data/mapping/dictionary.json`, `data/mapping/overrides.json` (`{"version":1,"moveCategory":[],"split":[],"approve":[]}`), `backend/prisma/migrations/<дата-время>_shymkent_taxonomy/migration.sql`
- Test: `pipeline/test/magnum-categories.test.ts`, `pipeline/test/taxonomy.test.ts`

**Interfaces:**
- Consumes: `MAGNUM_SCOPE` (`scrape/stores/magnum/scope.ts`), `storeCategoryKey`, `writeDictionary`.
- Produces: `seedStoreCategories(dict: Dictionary, store: StoreCode, scope: readonly {path: string[]; slug: CategorySlug}[]): Dictionary` — добавляет отсутствующие ключи, существующие не меняет; `latestTaxonomyMigration(migrationsDir: string): string | null`; `newTaxonomyMigrationPath(migrationsDir: string, now: Date): string` (`YYYYMMDDHHMMSS_shymkent_taxonomy/migration.sql`, UTC).

- [ ] **Step 1: Failing tests:** `seedStoreCategories` на пустом словаре даёт 38 ключей, ключ `MAGNUM|Продукты / Молочные продукты, яйцо / Яйцо` → `eggs`, у `Говядина ` пробел обрезан (как в `MAGNUM_SCOPE`); существующий ключ с другим slug не перезаписан. `taxonomy.test.ts`: самая поздняя `*_shymkent_taxonomy` миграция равна `buildTaxonomyMigration(readDictionary(...))`; `newTaxonomyMigrationPath(dir, new Date('2026-11-22T10:11:12Z'))` оканчивается на `20261122101112_shymkent_taxonomy/migration.sql`.
- [ ] **Step 2:** `pnpm vitest run test/magnum-categories.test.ts test/taxonomy.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать; CLI `taxonomy:sql` пишет новый файл и отказывается (exit 1), если содержимое совпадает с последней миграцией таксономии («no taxonomy change»). Удалить старый `TAXONOMY_MIGRATION`.
- [ ] **Step 4:** Удалить данные Актау; записать пустой словарь (`version 1`, `generatedAt` — текущее время, пустые `canonicals`/`products`), `pnpm dict:seed-categories`, `pnpm taxonomy:sql` → первая миграция таксономии (категории без фильтров).
- [ ] **Step 5:** `pnpm test`, `pnpm typecheck` → PASS.
- [ ] **Step 6: Commit** `git commit -m "Start the Shymkent dictionary with Magnum store categories"`.

### Task 6: Go — открытый код сети

**Files:**
- Modify: `backend-go/internal/catalog/models.go:34-40`, `backend-go/internal/ingestion/bundle.go:60-170`, `backend-go/internal/ingestion/ingestor.go:105-130,290-330`, `backend-go/internal/observability/metrics.go:117-125`, `backend-go/internal/postgres/dashboard.go:65`, `backend-go/scripts/{make-lite-baseline.mjs,local-ingest-db.sh}`
- Test: `backend-go/internal/ingestion/bundle_test.go`, `ingestor_integration_test.go`, `identity_integration_test.go`, `backend-go/internal/observability/metrics_test.go`, `backend-go/tests/fixtures/{catalog,szpt}.sql`, `backend-go/tests/integration/*`, остальные `_test.go` из `grep -l DINA`
- Create: `backend-go/internal/ingestion/testdata/prepared_bundle.json` (синтетический, вместо `data/snapshots/final_dataset.json`)

**Interfaces:**
- Produces: `catalog.ValidStoreCode(code string) bool` (шаблон `^[A-Z][A-Z0-9_]{1,31}$`); `Decode` отвергает невалидный код (`prepared bundle invalid`); ingestor: множество кодов в `sourceRuns` бандла должно совпадать с множеством `stores.code` — иначе ошибка `ingestion stores mismatch`; `Registry.Age` пишет метрику только для валидного кода.

- [ ] **Step 1: Failing tests:** `TestBundleValidation` — кейсы `magnum`, `M`, `MAGNUM-1`, 33×`A` → ошибка; `STORE_A` → OK. Интеграционный: в `stores` есть `STORE_A` и `STORE_B`, бандл только с `STORE_A` → `ingestion stores mismatch`; бандл с `STORE_C` → ошибка, снимок не создан. `metrics_test`: `Age("bad code", …)` не создаёт метку, `Age("MAGNUM", …)` создаёт. `TestPreparedDataset` читает `testdata/prepared_bundle.json` (две синтетические сети, есть группа, совпавшая между сетями) — счётчики под новую фикстуру.
- [ ] **Step 2:** `go test ./internal/ingestion/ ./internal/observability/` → FAIL.
- [ ] **Step 3:** Реализовать: убрать константы сетей Актау и `stores`-список; `dashboard.go` — `ORDER BY "sortOrder", code` (выбрать `"sortOrder"` в CTE корзин); `code::text` в запросах можно оставить или убрать.
- [ ] **Step 4:** Фикстуры и тесты: `DINA`→`STORE_A`, `DANA`→`STORE_B`, `FIX_PRICE`→`STORE_C`, `ANVAR`→`MAGNUM` (там, где тест проверяет весовые — `MAGNUM` с `isWeighted`). Тесты сравнения сетей сохраняются.
- [ ] **Step 5:** `node scripts/ci/run-checks.mjs go` → PASS; `node scripts/ci/run-db-integration.mjs` (одноразовая БД) → PASS.
- [ ] **Step 6: Commit** `git commit -m "Accept any registered store code in the Go API and ingest"`.

### Task 7: Контракт OpenAPI

**Files:**
- Modify: `contracts/openapi.yaml:357-359`, `contracts/examples/*.json`, `contracts/tests/contract.test.mjs` (если проверяет enum), `docs/production/API_V1_CONTRACT.md`

- [ ] **Step 1: Failing test** в `contract.test.mjs`: `StoreCode` — `type: string`, `pattern: '^[A-Z][A-Z0-9_]{1,31}$'`, без `enum`; примеры содержат только коды, проходящие шаблон, и ни одного из `DINA|DANA|FIX_PRICE|ANVAR`.
- [ ] **Step 2:** `node scripts/ci/run-checks.mjs contracts` → FAIL.
- [ ] **Step 3:** Правки контракта и примеров (`MAGNUM`, `STORE_A`); в `API_V1_CONTRACT.md` — абзац о совместимости: значения кода больше не перечисляются, клиент принимает любой код по шаблону.
- [ ] **Step 4:** `node scripts/ci/run-checks.mjs contracts` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Describe the store code as a patterned string in API v1"`.

### Task 8: Фронтенд

**Files:**
- Modify: `frontend/src/api/types.ts:3`, `frontend/src/lib/stores.ts`, `frontend/scripts/generate-mocks.mjs`, `frontend/src/mocks/*`, тесты `frontend/src/**/*.test.ts(x)` из `grep -l DINA`

- [ ] **Step 1: Failing test** `stores.test.ts`: `storeColor('MAGNUM')` — не `#697178` и не зелёный; `storeColor('STORE_X')` → `#697178`.
- [ ] **Step 2:** `node scripts/ci/run-checks.mjs frontend` → FAIL.
- [ ] **Step 3:** `StoreCode = string`; `STORE_COLORS: Record<string, string>` с одним `MAGNUM` (цвет из прежней палитры, например `#2a78d6`); моки и тесты — `MAGNUM`/`STORE_A`/`STORE_B`; перегенерировать моки скриптом, если он их порождает.
- [ ] **Step 4:** `node scripts/ci/run-checks.mjs frontend` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Show Magnum and any registered store in the frontend"`.

### Task 9: Скрипты релиза и операций, правило веса в ops

**Files:**
- Modify: `scripts/deploy/{auto-gate.test.mjs,auto-transport.mjs,auto_smoke_test.py}`, `scripts/ops/{verify-go-production.mjs,verify-go-production.test.mjs}`, `ops/sync/{README.md,aktau-sync.env.example}`, `ops/postgres/szpt/{offer_price_basis_check.sql,szpt_members_explain.sql}`

- [ ] **Step 1:** `auto-transport.mjs`: убрать записи удалённых миграций; список разрешённых миграций может стать пустым — тогда автотранспорт любой миграции отказывает. `auto-gate.test.mjs`: удалить кейсы удалённых файлов, добавить кейс «`20261122000000_shymkent_baseline/migration.sql` не разрешена автотранспортом».
- [ ] **Step 2:** Коды Актау в `auto_smoke_test.py`, `verify-go-production*` → `MAGNUM` (или проверка «есть хотя бы одна сеть»); `SYNC_STORES=MAGNUM` в `ops/sync`. `offer_price_basis_check.sql` — правило Magnum и ссылка на базовую миграцию.
- [ ] **Step 3:** `node scripts/ci/run-checks.mjs ops` и `security` → PASS; `node --test scripts/deploy/auto-gate.test.mjs` → PASS.
- [ ] **Step 4: Commit** `git commit -m "Point release and ops checks at the Shymkent baseline"`.

### Task 10: Документы

**Files:**
- Delete: `docs/data/*` кроме `SYNC_RUNBOOK.md`, `docs/backend-2/*`, `docs/superpowers/plans/{2026-10-05-scrum-7-anvar-full-catalog,2026-10-06-scrum-7-review-fixes,2026-10-13-fast-price-sync,2026-10-16-dana-fast-scrape}.md`, `docs/superpowers/specs/2026-10-13-fast-price-sync-design.md`, прочие документы `docs/superpowers/` про источники/магазины/данные Актау (решение по каждому — в отчёте)
- Modify: `docs/data/SYNC_RUNBOOK.md` (переписать), `README.md`, `docs/README.md`, `AGENTS.md`, `pipeline` README (если есть) — ссылки

- [ ] **Step 1:** Удалить документы; `rg -n "<имя удалённого файла>"` по репозиторию для каждого — исправить ссылки.
- [ ] **Step 2:** `SYNC_RUNBOOK.md`: локальный поток `pnpm scrape:magnum` → `pnpm sync` (`SYNC_STORES=MAGNUM`) → Go `cmd/ingest` на одноразовой БД → проверка `/api/szpt`; без инфраструктуры и сетей Актау, без описания способа получения данных.
- [ ] **Step 3:** `node scripts/ci/run-checks.mjs security` (поиск ссылок/секретов) → PASS.
- [ ] **Step 4: Commit** `git commit -m "Remove Aktau source and data documents"`.

### Task 11: Проверка на БД, отчёт, локальный CI

**Files:**
- Create: `docs/production/reports/SHYMKENT_DATA_BASELINE_REPORT.md`

- [ ] **Step 1:** Скопировать `C:\Development\shymkentmarket-worktrees\async-scrapers-core\data\sources\magnum.json` в `data/sources/` (в `.gitignore`).
- [ ] **Step 2:** Одноразовая PostgreSQL (проверить сервер/БД/роль): база + таксономия → роли из `backend/prisma/security/` как в `run-db-integration.mjs` → `SYNC_STORES=MAGNUM SYNC_MAX_SOURCE_AGE_HOURS=720 pnpm sync` → Go `cmd/ingest` (`-apply`) → снимок опубликован; `SELECT count(*) FROM offers WHERE "snapshotId"=<новый>` > 0; `SELECT count(*) FROM offer_price_basis WHERE "soldByWeight"` ≈ число весовых в файле.
- [ ] **Step 3:** Поиск `rg -n "\b(DINA|DANA|FIX_PRICE|ANVAR)\b"` по `pipeline backend backend-go contracts frontend ops scripts data` → пусто.
- [ ] **Step 4:** Локальный CI `node C:/Development/AdilBaga-local-ci/run-local.mjs` с группами `contracts,go,schema,frontend,pipeline,security,ops,guard` → PASS.
- [ ] **Step 5:** Отчёт по образцу `SHYMKENT_MAGNUM_ASYNC_SCRAPERS_REPORT.md`: база, изменённые файлы, сравнение схем (diff), решения по документам, проверки PASS/FAIL/SKIP/NOT_RUN, риски (совместимость клиентов с enum; роли `aktau_*`), условие остановки.
- [ ] **Step 6: Commit** `git commit -m "Report the Shymkent data baseline"`. Push и PR — только после «да» Owner.
