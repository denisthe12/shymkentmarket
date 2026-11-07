# Помесячная история цен: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бессрочно хранить цену каждого сопоставленного товара на 1-е число месяца, чтобы очистка снимков её не удаляла.

**Architecture:** Новая компактная таблица `price_history` хранит одну строку на месяц, магазин и товар. Шаг очистки `cmd/prune` перед удалением снимков дописывает в неё недостающие месяцы, поэтому снимок нельзя удалить раньше, чем его цены попали в историю. Новых логинов, переменных окружения и шагов в `daily-sync.sh` нет.

**Tech Stack:** Go 1.27 + pgx v5, PostgreSQL 17 (Supabase), Prisma migrations, Node 24 `node:test`.

**Spec:** Отдельного документа нет. Запрос Дениса от 2026-11-07 и решения из этой сессии перечислены в Global Constraints.

## Global Constraints

- Цена месяца: первый успешный сбор магазина в этом месяце. Обычно это запуск 1-го числа в 06:00 по Актау (01:00 UTC).
- Границы месяца считаются в часовом поясе `Asia/Aqtau`. `capturedAt` и `publishedAt` хранятся в UTC без часового пояса.
- Источник строк: таблица `offers`. В ней только сопоставленные товары: на 2026-11-07 `offers` = `raw_products` = 4 788 в последнем снимке, несопоставленные позиции в снимок не попадают.
- Сопоставления со статусом `pending` сохраняются вместе со статусом в `reviewStatus`, потому что сайт показывает их как обычные предложения (741 из 4 788).
- Месяц магазина записывается один раз и больше не меняется. Товар, появившийся в магазине позже, попадёт в историю со следующего месяца.
- У `price_history` нет FK на `snapshots`, иначе очистка упрётся в запрет на удаление. FK на `stores` и `canonical_products` стоят с `ON DELETE RESTRICT`, чтобы каскад не стёр историю.
- Роль `aktau_retention_writer` получает на `price_history` только `SELECT, INSERT`. `UPDATE` и `DELETE` нет ни у одной рабочей роли.
- RLS на таблице включена. Миграция не создаёт политик: точные счётчики `pg_policies` в `rollout_test.go` не должны измениться. Supabase по умолчанию выдаёт права `anon` и `authenticated`, поэтому миграция их отзывает.
- Ошибка записи истории отменяет удаление снимков в этом запуске. Снимок при этом уже опубликован, скрипт завершается кодом 4.
- Файлы ролей лежат в `ops/postgres/security`, файлы `backend/prisma/security` не меняются.
- Порядок в проде строгий: миграция, заполнение прошлых месяцев, права, код на VPS. Иначе первый запуск запишет ноябрь из более позднего снимка, и заполнение из дампа его уже не перепишет.
- Пароли и закрытые ключи не попадают в чат и к агенту. Команды на VPS и команды с паролем вводит пользователь.

## Review Focus

1. Синхронизация 1-го числа упала: месяц берётся из следующего удачного запуска, дата видна в `capturedAt`.
2. Магазин устарел 1-го числа: снимок несёт файл с `capturedAt` прошлого месяца, такой файл не должен стать ценой нового месяца.
3. Магазин появился в середине месяца, как Anvar 2026-11-05: его месяц заполняется с первого сбора, уже записанные магазины не меняются.
4. Сбор в 19:30 UTC 31-го числа относится к следующему месяцу по времени Актау.
5. Повторные запуски в течение месяца не меняют строки и не добавляют новые товары.

---

### Task 1: Таблица `price_history`

**Files:**
- Create: `backend/prisma/migrations/20261107000000_price_history/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `scripts/ci/postgres.mjs:50`
- Modify: `backend-go/scripts/local-ingest-db.sh:40`

**Interfaces:**
- Produces: таблица `public.price_history` с колонками `month date`, `storeId text`, `canonicalProductId text`, `sourceProductId text`, `rawName text`, `price integer`, `oldPrice integer NULL`, `reviewStatus "ReviewStatus"`, `capturedAt timestamp(3)`, `snapshotId text`, `createdAt timestamp(3) DEFAULT CURRENT_TIMESTAMP`. Первичный ключ: `(month, storeId, canonicalProductId)`.

- [ ] **Step 1: Создать ветку от свежего main**

```bash
git fetch origin main
git switch -c claude/monthly-price-history origin/main
```

- [ ] **Step 2: Добавить модель `PriceHistory` с `@@map("price_history")`**

`month` объявить как `DateTime @db.Date`. Связи `store` и `canonicalProduct` с `onDelete: Restrict`, обратные поля добавить в `Store` и `CanonicalProduct`. `snapshotId` остаётся обычной строкой без связи.

- [ ] **Step 3: Написать миграцию**

Вывести DDL через `prisma migrate diff`, затем дописать:

```sql
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_history FROM PUBLIC;
DO $revoke$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL ON public.price_history FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL ON public.price_history FROM authenticated; END IF;
END $revoke$;
```

- [ ] **Step 4: Дописать `20261107000000_price_history` в цепочку в `postgres.mjs:50` и строкой `run` в `local-ingest-db.sh`**

- [ ] **Step 5: Проверить цепочку миграций**

Run: `node scripts/ci/run-db-integration.mjs`
Expected: PASS, ошибки `migration chain mismatch` нет.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma scripts/ci/postgres.mjs backend-go/scripts/local-ingest-db.sh
git commit -m "feat(history): add monthly price history table"
```

### Task 2: Права очистки на историю

**Files:**
- Create: `ops/postgres/security/aktau_retention_price_history_access.sql`
- Create: `ops/postgres/security/rollback_aktau_retention_price_history_access.sql`
- Modify: `scripts/ci/run-db-integration.mjs:35-43`
- Test: `backend-go/internal/retention/role_integration_test.go`

**Interfaces:**
- Consumes: `public.price_history` из Task 1, группа `aktau_retention_writer`.
- Produces: политики `aktau_retention_writer_select` и `aktau_retention_writer_insert` на `price_history`. Всего у роли 12 политик.

- [ ] **Step 1: Изменить тест ролей**

Поменять ожидание в строках 108-109 с 10 на 12 политик и добавить проверку:

```go
// has_table_privilege('aktau_retention_writer','public.price_history',p)
// SELECT, INSERT -> true; UPDATE, DELETE, TRUNCATE -> false
// для 'aktau_ingest_writer' и 'aktau_api_reader' все пять -> false
```

- [ ] **Step 2: Запустить `node scripts/ci/run-db-integration.mjs` и убедиться, что тест ролей падает**

Expected: FAIL с `expected 12 retention policies, got 10`.

- [ ] **Step 3: Написать SQL прав**

Одна транзакция с `lock_timeout='5s'`: `GRANT SELECT, INSERT`, две политики (`USING (true)` и `WITH CHECK (true)`). Rollback удаляет обе политики и отзывает права.

- [ ] **Step 4: В `run-db-integration.mjs` применять файл сразу после role SQL, а rollback запускать перед `rollback_aktau_retention_writer_access.sql`**

- [ ] **Step 5: Запустить проверки и убедиться, что тест ролей и откат проходят**

Run: `node scripts/ci/run-db-integration.mjs`
Expected: PASS, включая проверку `to_regrole('aktau_retention_writer') IS NULL` после отката.

- [ ] **Step 6: Commit**

```bash
git add ops/postgres/security scripts/ci/run-db-integration.mjs backend-go/internal/retention/role_integration_test.go
git commit -m "feat(history): let retention append price history"
```

### Task 3: Запись истории перед очисткой

**Files:**
- Create: `backend-go/internal/retention/history.go`
- Create: `backend-go/internal/retention/history_integration_test.go`
- Modify: `backend-go/internal/retention/retention.go`
- Modify: `backend-go/cmd/prune/main.go:30`

**Interfaces:**
- Consumes: права из Task 2.
- Produces: `func (p *Pruner) archive(ctx context.Context) (int64, error)`, поле `Report.History int64`, поле лога `history_count`. В `Plan` поле `History` содержит число строк, которые были бы записаны.

- [ ] **Step 1: Написать падающие интеграционные тесты в `history_integration_test.go`**

Хелперы `setup`, `seed`, `pruner` уже есть в `retention_integration_test.go`. Новый хелпер `e.capture(t, snapshotID, store, capturedAt, status)` ставит `source_runs`, а `e.historyRows(t)` читает строки по test-owned префиксу. `cleanup` дополнить удалением этих строк.

| Тест | Данные | Ожидание |
|---|---|---|
| `TestLocalRetentionHistoryFirstCaptureOfMonth` | снимки 1 и 2 ноября | месяц `2026-11-01`, цена и `capturedAt` из снимка 1 ноября |
| `TestLocalRetentionHistoryFallsBackWhenFirstMissing` | снимки только с 3 ноября | месяц `2026-11-01`, `capturedAt` 3 ноября |
| `TestLocalRetentionHistorySkipsStaleCapture` | снимок 1 ноября с `capturedAt` 31 октября у DANA, снимок 2 ноября со свежим сбором | ноябрь DANA из снимка 2 ноября |
| `TestLocalRetentionHistoryAddsLateStore` | второй магазин появляется 5 ноября, запуски до и после | первый магазин не изменился, второй записан с `capturedAt` 5 ноября |
| `TestLocalRetentionHistoryUsesAqtauMonth` | `capturedAt` 2026-11-30 19:30 UTC | месяц `2026-12-01` |
| `TestLocalRetentionHistoryIsIdempotent` | второй `Apply`, цена и новый товар в свежем снимке | `History=0`, строки не изменились |
| `TestLocalRetentionHistorySurvivesPrune` | снимок удаляется очисткой | строки истории на месте |
| `TestLocalRetentionHistoryFailureStopsDeletes` | владелец отзывает `INSERT` у группы | `Apply` вернул ошибку, `Deleted=0`, снимки на месте; право возвращается в `t.Cleanup` |
| `TestLocalRetentionPlanIsReadOnly` (дополнить) | есть незаписанный месяц | `Plan` вернул `History>0`, таблица пуста |

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `node scripts/ci/run-db-integration.mjs`
Expected: FAIL, `p.archive` и `Report.History` не определены.

- [ ] **Step 3: Реализовать `history.go`**

Общий SELECT лежит в константе `historyRowsSQL`, `archive` оборачивает его в INSERT, а `Plan` в `count(*)`:

```sql
WITH firsts AS (
  SELECT DISTINCT ON (x."storeId", m.month)
         x."storeId", x."snapshotId", x."capturedAt", m.month
  FROM public.source_runs x
  JOIN public.snapshots s ON s.id=x."snapshotId"
  CROSS JOIN LATERAL (
    SELECT date_trunc('month', x."capturedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Aqtau')::date AS month
  ) m
  WHERE s.status='published' AND s."publishedAt" IS NOT NULL
    AND x.status='succeeded' AND x."capturedAt" IS NOT NULL
  ORDER BY x."storeId", m.month, x."capturedAt", s."publishedAt", s.id
)
SELECT f.month, o."storeId", o."canonicalProductId", r."sourceProductId", r."rawName",
       o.price, o."oldPrice", pm."reviewStatus", f."capturedAt", f."snapshotId"
FROM firsts f
JOIN public.offers o ON o."snapshotId"=f."snapshotId" AND o."storeId"=f."storeId"
JOIN public.raw_products r ON r.id=o."rawProductId"
JOIN public.product_mappings pm ON pm."rawProductId"=r.id AND pm."canonicalProductId"=o."canonicalProductId"
WHERE NOT EXISTS (
  SELECT 1 FROM public.price_history h WHERE h.month=f.month AND h."storeId"=f."storeId"
)
```

INSERT заканчивается на `ON CONFLICT DO NOTHING`. Ошибки без текста драйвера, как в остальном пакете: `errors.New("retention history failed")`.

- [ ] **Step 4: Вызвать `archive` в `Apply` сразу после `lock` и до `candidates`, заполнять `History` в `Plan`, добавить `history_count` в лог `cmd/prune`**

При ошибке `Apply` возвращает её сразу, не удаляя снимки.

- [ ] **Step 5: Запустить проверки**

Run: `node scripts/ci/run-db-integration.mjs`, затем `node scripts/ci/run-checks.mjs go`
Expected: PASS в обоих, включая `-race`.

- [ ] **Step 6: Commit**

```bash
git add backend-go/internal/retention backend-go/cmd/prune
git commit -m "feat(history): record monthly prices before pruning"
```

### Task 4: Документация и PR

**Files:**
- Create: `ops/postgres/import-price-history.sql`
- Modify: `docs/data/SYNC_RUNBOOK.md`
- Modify: `ops/sync/README.md`
- Modify: `ops/postgres/README.md:79`

- [ ] **Step 1: Написать `import-price-history.sql`**

Скрипт в одной транзакции грузит CSV во временную таблицу через `\copy`, вставляет строки с `ON CONFLICT DO NOTHING` и выводит `month, count(*)`. Его использует Task 6.

- [ ] **Step 2: Описать историю в runbook**

Добавить правило месяца, поле `history_count`, запрос для проверки и поведение при ошибке. В `ops/postgres/README.md` заменить «nine app tables» на десять таблиц.

- [ ] **Step 3: Commit, push и PR в main**

```bash
git add docs/data/SYNC_RUNBOOK.md ops/sync/README.md ops/postgres
git commit -m "docs(history): document monthly price history"
git push -u origin claude/monthly-price-history
```

Expected: CI зелёный.

Исключение в `scripts/deploy/auto-transport.mjs` в этот PR не входит. Проверка защищённых путей срабатывает только при релизе API через `deploy-production.yml`, а эта работа API не выпускает. Следующий такой релиз остановится на `PROTECTED_DELTA`, тогда нужно добавить запись в `approvedExceptions` под фактический активный релиз.

### Task 5: Заполнение октября и ноября из дампа

Выполняется на компьютере пользователя после слияния, Docker должен быть запущен. Дамп лежит в `C:\Users\ADMIN\aktau-backups\retention-20261106T122823Z`.

- [ ] **Step 1: Восстановить дамп в одноразовый PostgreSQL 17**

Порядок из `rehearse-inner.sh`: создать NOLOGIN-роли `aktau_api_reader`, `aktau_ingest_writer`, `DROP SCHEMA public CASCADE`, `pg_restore`. Затем применить миграцию Task 1, `aktau_retention_writer_role.sql`, SQL прав из Task 2 и создать локальный логин.

- [ ] **Step 2: Записать историю на копии, ничего не удаляя**

Run: `APP_ENV=development RETENTION_DATABASE_URL=<локальная строка> go run ./cmd/prune -keep 1000 -apply`
Expected: `deleted_count=0`, `history_count` больше нуля.

- [ ] **Step 3: Проверить результат на копии и выгрузить CSV**

```sql
SELECT month, "storeId", count(*), min("capturedAt") FROM public.price_history GROUP BY 1,2 ORDER BY 1,2;
```

Expected: месяцы `2026-10-01` и `2026-11-01`. Ноябрь у трёх магазинов с `capturedAt` 2026-11-01, у Anvar от 2026-11-05. Октябрь начинается примерно с 4-5 октября: самый ранний снимок виден только по старым логам сессии, точную дату покажет этот запрос.

### Task 6: Выкатка в прод

Строго в этом порядке. Команды с паролем вводит пользователь.

- [ ] **Step 1: Применить миграцию к проду**

Run: `pnpm exec prisma migrate deploy` из `backend` с `DIRECT_URL`, пароль скрытым вводом.
Expected: применена только `20261107000000_price_history`, сайт отвечает 200.

- [ ] **Step 2: Импортировать CSV**

Run: `psql` от владельца с `ops/postgres/import-price-history.sql`.
Expected: те же количества по месяцам, что в Task 5.

- [ ] **Step 3: Применить `aktau_retention_price_history_access.sql`**

Expected: у `aktau_retention_writer` 12 политик, `anon` и `authenticated` не читают `price_history`.

- [ ] **Step 4: Обновить checkout синхронизации на VPS через git bundle и выполнить dry run**

Run на VPS: `go run ./cmd/prune -keep 14`
Expected: `history_count=0`, `deleted_count=0`, код 0.

- [ ] **Step 5: Проверить естественные запуски**

Ближайший запуск: `history_count=0`, снимков 14, в журнале нет `[sync] retention failed`.
Запуск 2026-12-01 01:00 UTC: появляются строки месяца `2026-12-01`, примерно 4 800.
