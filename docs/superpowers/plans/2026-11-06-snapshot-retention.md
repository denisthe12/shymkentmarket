# Хранение снимков цен: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Остановить рост базы Supabase до лимита Free-плана 500 МБ: удалить старые снимки цен и настроить автоматическое хранение последних 14 снимков.

**Architecture:** Разовая очистка выполняется SQL-скриптом сразу после проверенного дампа и не зависит от релиза кода. Постоянную очистку делает новая команда `backend-go/cmd/prune`, её вызывает `daily-sync.sh` после публикации под отдельной ролью `aktau_retention_writer`. Права `aktau_ingest_writer` не меняются.

**Tech Stack:** Go 1.27 + pgx v5, PostgreSQL 17 (Supabase), bash, Node 24 `node:test`.

**Spec:** Отдельного документа нет. Решения приняты в сессии 2026-11-06 и перечислены в разделе «Исходные данные».

## Исходные данные

- На 2026-11-06 размер по дашборду 365 МБ, лимит 500 МБ. Рост около 21 МБ в день, лимит будет достигнут примерно 2026-11-12.
- Снимков 47, в трёх таблицах по 154 097 строк. Bloat нет, рост даёт только история.
- API и ingest читают только последний снимок. `PriceHistory` и `ListRecentPublishedSnapshots` вызываются только из тестов.
- Nest в проде не запущен (проверено на VPS 2026-11-06).
- Таблица истории цен не делается: старые цены остаются в дампе.
- Хранить последние **14** снимков (7 дней). Ожидаемый размер: около 133 МБ после `VACUUM FULL`, около 175 МБ в установившемся режиме.

## Global Constraints

- Срок: задачи 1 и 2 завершены до **2026-11-10** включительно.
- Владелец базы — пользователь (аккаунт Supabase `aapolezhayev's Org`). Его явное подтверждение в чате обязательно до задачи 2 (удаление данных) и до применения роли в задаче 7.
- Изменения на VPS в задаче 7 (код и `/etc/aktau-sync.env`) согласуются с командой отдельно: приёмка G3 и порядок релизов не относятся к владению базой.
- Приёмка G3 идёт до weekly 2026-11-08 22:00Z. До её завершения checkout на VPS остаётся на `8a125fc`, ручные sync и webhook запрещены.
- Команды на VPS вводит человек. Агент не подключается к VPS и не работает с паролями и ключами.
- Продовые операции только вне окон sync: не в `00:50–01:30` и не в `12:50–13:30` UTC, не в воскресенье `21:50–23:59` UTC.
- `aktau_ingest_writer` не получает новых прав. Существующая проверка `denied(writer, "DELETE ...")` в `snapshot_security_test.go` остаётся без изменений.
- CI: 9 имён job не меняются, новые job и `paths-ignore` не добавляются.
- Prisma-миграции не добавляются. Цепочка в `scripts/ci/postgres.mjs` остаётся прежней.
- Порядок удаления одного снимка фиксирован: `offers` → `product_mappings` → `raw_products` → `source_runs` → `snapshots`. На `offers.rawProductId` нет индекса, поэтому каскад от `raw_products` по заполненной таблице будет медленным.
- Логи содержат только счётчики: без URL, паролей, названий товаров и id снимков.
- Репозиторий приватный: код на VPS обновляется через `git bundle`, токены на VPS не кладутся.

## Review Focus

- Prune запущен, пока ingest держит advisory-блокировку: команда отказывается работать и ничего не удаляет (задача 4, `TestLocalRetentionRefusesWhileIngestRuns`).
- Опубликованных снимков меньше или ровно `keep`, например на новой базе: ничего не удаляется, код выхода 0 (задача 4, `TestLocalRetentionNoopWhenFewSnapshots`).
- Старый снимок в статусе `building`, `validating` или `failed`: остаётся нетронутым (задача 4, `TestLocalRetentionKeepsUnpublished`).
- Сбой посреди прогона: снимок удаляется целиком либо не удаляется совсем, повторный запуск доводит работу до конца (задача 4, `TestLocalRetentionResumesAfterFailure`).
- В `RETENTION_KEEP_SNAPSHOTS` пустое, нечисловое или слишком малое значение: команда падает до подключения к базе, а публикация цен уже прошла и остаётся в силе (задачи 5 и 6, `TestKeepBelowMinimumRejected`, сценарий `prune-failed`).

---

## Часть A. Разовая очистка (не зависит от кода)

### Task 1: Дамп и проверка восстановления

Исполнитель: владелец базы на своей рабочей машине. Агент пишет команды и проверяет вывод, пароль в чат не попадает.

**Files:** изменений в репозитории нет. Инструменты: `ops/postgres/backup.sh`, `ops/postgres/restore-test.sh`, порядок описан в `ops/postgres/README.md`.

**Окружение:** локально нет `pg_dump` и секретных ключей GPG, поэтому оба скрипта запускаются в Docker, образ собирается из `C:\Users\ADMIN\aktau-handoff\tools\backup\Dockerfile`. Дамп шифруется новым ключом владельца базы. Прошлые бэкапы зашифрованы на ключ `D62644E4…`, закрытого ключа к нему на этой машине нет, поэтому для этого дампа он не подходит: проверка восстановления требует расшифровки. Закрытый ключ хранится вне репозитория.

- [ ] **Step 1: Записать контрольные счётчики**

Выполнить вне окна sync и сохранить результат:

```sql
select (select count(*) from snapshots) snapshots, (select count(*) from raw_products) raw_products,
       (select count(*) from offers) offers, (select count(*) from product_mappings) product_mappings,
       (select count(*) from source_runs) source_runs;
```

- [ ] **Step 2: Снять зашифрованный дамп**

Настроить `BACKUP_*` по разделу Backup в README. `BACKUP_DATABASE_URL` указывает на session pooler (порт 5432). Запуск: `rtk proxy bash ops/postgres/backup.sh`.
Expected: `backup_encryption:PASS`, рядом лежат `.dump.gpg` и `.json`.

- [ ] **Step 3: Восстановить дамп в одноразовый PostgreSQL 17**

Поднять `postgres:17-alpine` на `127.0.0.1`, создать базу `part11_retention` и NOLOGIN-роли `aktau_api_reader`, `aktau_ingest_writer`. Запуск: `rtk proxy bash ops/postgres/restore-test.sh`.
Expected: `restore_checksum_and_exit_zero:PASS`.

- [ ] **Step 4: Сверить счётчики и удалить контейнер**

Запрос из шага 1 на восстановленной базе.
Expected: все пять чисел совпадают с шагом 1. При расхождении стоп: задачу 2 не начинать.

- [ ] **Step 5: Убедиться, что дамп лежит вне VPS и вне репозитория**

Expected: файл `.dump.gpg` и ключ для расшифровки доступны владельцу, путь и контрольная сумма из `.json` записаны.

### Task 2: Разовое удаление снимков

**Files:**
- Create: `ops/postgres/prune-snapshots-once.sql`

**Interfaces:**
- Consumes: проверенный дамп из задачи 1, подтверждение владельца базы.
- Produces: в базе остаются 14 последних опубликованных снимков.

- [ ] **Step 1: Создать `ops/postgres/prune-snapshots-once.sql`**

Текст фиксирован. Один запуск удаляет не больше 8 снимков, начиная с самых старых.

```sql
-- Разовая очистка: оставляет 14 последних опубликованных снимков. Запускать повторно, пока remaining = 0.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
  IF NOT pg_try_advisory_xact_lock(71791791920392) THEN RAISE EXCEPTION 'ingestion running'; END IF;
END $guard$;
CREATE TEMP TABLE victims ON COMMIT DROP AS
  SELECT id FROM (
    SELECT id, row_number() OVER (ORDER BY "publishedAt" DESC, id DESC) rn
    FROM public.snapshots WHERE status='published' AND "publishedAt" IS NOT NULL
  ) ranked WHERE rn > 14 ORDER BY rn DESC LIMIT 8;
DELETE FROM public.offers WHERE "snapshotId" IN (SELECT id FROM victims);
DELETE FROM public.product_mappings m USING public.raw_products r
  WHERE m."rawProductId"=r.id AND r."snapshotId" IN (SELECT id FROM victims);
DELETE FROM public.raw_products WHERE "snapshotId" IN (SELECT id FROM victims);
DELETE FROM public.source_runs WHERE "snapshotId" IN (SELECT id FROM victims);
DELETE FROM public.snapshots WHERE id IN (SELECT id FROM victims);
SELECT count(*) AS victims FROM victims;
COMMIT;
SELECT count(*) FILTER (WHERE rn>14) AS remaining FROM (SELECT row_number() OVER (ORDER BY "publishedAt" DESC, id DESC) rn FROM public.snapshots WHERE status='published' AND "publishedAt" IS NOT NULL) r;
```

`71791791920392` — это `ingestion.AdvisoryLockKey` (`0x414B54415508`) в десятичном виде.

- [ ] **Step 2: Получить подтверждение владельца базы**

Показать результат задачи 1 и число снимков к удалению.
Expected: в чате есть явное «удаляй». Удаление не меняет checkout и не запускает sync, поэтому правила приёмки G3 соблюдены. Перед запуском проверить, что нет окна sync.

- [ ] **Step 3: Запускать скрипт в окне без sync, пока `remaining` не станет 0**

Запуск: SQL Editor Supabase или MCP `execute_sql` с отдельного разрешения пользователя.
Expected: `victims` равен 8, затем меньше; последний запрос показывает `remaining`, и повторять нужно до `remaining` = 0. Ошибка `ingestion running` означает, что нужно подождать окончания sync.

- [ ] **Step 4: Освободить место для повторного использования**

```sql
VACUUM (ANALYZE) public.offers, public.product_mappings, public.raw_products, public.source_runs, public.snapshots;
```

- [ ] **Step 5: Проверить результат**

```sql
select (select count(*) from snapshots where status='published') snapshots,
       (select count(*) from raw_products r where not exists (select 1 from snapshots s where s.id=r."snapshotId")) orphan_raw,
       (select count(*) from offers o join snapshots s on s.id=o."snapshotId"
        where s.id=(select id from snapshots where status='published' order by "publishedAt" desc, id desc limit 1)) latest_offers;
```

Expected: `snapshots = 14`, `orphan_raw = 0`, `latest_offers` равен числу строк последнего снимка до очистки. `https://api.aktau.market/api/dashboard` отвечает 200.

- [ ] **Step 6: Проверить следующий естественный sync**

Expected: следующий прогон в 01:00 или 13:00 UTC публикует снимок, `journalctl -u aktau-sync -n 200` без новых ошибок.

- [ ] **Step 7: Commit**

```bash
git add ops/postgres/prune-snapshots-once.sql
git commit -m "ops(postgres): add one-off snapshot cleanup script"
```

---

## Часть B. Код автоочистки

### Task 3: Роль `aktau_retention_writer`

**Files:**
- Create: `backend/prisma/security/aktau_retention_writer_role.sql`
- Create: `backend/prisma/security/rollback_aktau_retention_writer_access.sql`
- Modify: `scripts/ci/postgres.mjs` (добавить `part13_retention` в `databases`)
- Modify: `scripts/ci/run-db-integration.mjs` (новый блок в конце `postgres(...)`)
- Test: `backend-go/internal/retention/role_integration_test.go`

**Interfaces:**
- Produces: NOLOGIN-группа `aktau_retention_writer`. Права: `USAGE` на `public`, `SELECT, DELETE` на `snapshots`, `source_runs`, `raw_products`, `product_mappings`, `offers`. На каждую из этих таблиц две политики: `aktau_retention_writer_select` и `aktau_retention_writer_delete`, обе `USING (true)`, всего 10.
- Produces: CI передаёт в Go-тесты `TEST_RETENTION_ADMIN_DATABASE_URL` (owner базы `part13_retention`) и `TEST_RETENTION_WRITER_DATABASE_URL` (логин `part13_retention_login`).

- [ ] **Step 1: Написать падающий тест `TestLocalRetentionRoleBoundary`**

Файл с тегом `//go:build integration`. Без переменных окружения тест делает `t.Skip`, для нелокального адреса падает. Под логином writer проверить:
- `DELETE FROM public.offers WHERE false` проходит;
- `INSERT` в `offers` и `UPDATE` на `snapshots` дают код `42501`;
- `SELECT`, `DELETE` на `stores`, `categories`, `canonical_products` дают код `42501`;
- под admin: `count(*)` из `pg_policies` для роли равен 10;
- роль `NOLOGIN`, `NOBYPASSRLS`, `NOSUPERUSER`, `NOCREATEROLE`.

- [ ] **Step 2: Добавить запуск в CI и убедиться, что тест падает**

В `postgres.mjs` добавить базу. В конце `run-db-integration.mjs`: применить SQL роли к `part13_retention`, вызвать `login('part13_retention_login', 'aktau_retention_writer')`, запустить `go test -count=1 -race -tags=integration ./internal/retention -run '^TestLocalRetention' -v`.
Run: `node scripts/ci/run-db-integration.mjs` (нужен Docker).
Expected: FAIL, файла роли ещё нет.

- [ ] **Step 3: Написать `aktau_retention_writer_role.sql`**

Как в `aktau_ingest_writer_role.sql`: `BEGIN`, `SET LOCAL lock_timeout='5s'`, `SET LOCAL statement_timeout='10s'`, `LOCK TABLE` пяти таблиц, создание роли с `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`, отказ при существующей роли с другими атрибутами, `GRANT`, `CREATE POLICY`, `COMMIT`. Rollback-файл снимает политики и права и удаляет группу, если у неё нет участников.

- [ ] **Step 4: Запустить тесты**

Run: та же команда, что в шаге 2.
Expected: PASS, включая `TestLocalSnapshotSecurity` без изменений.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/security scripts/ci backend-go/internal/retention/role_integration_test.go
git commit -m "feat(retention): add restricted retention writer role"
```

### Task 4: Пакет `internal/retention`

**Files:**
- Create: `backend-go/internal/retention/retention.go`
- Test: `backend-go/internal/retention/retention_test.go`
- Test: `backend-go/internal/retention/retention_integration_test.go`

**Interfaces:**
- Consumes: `ingestion.AdvisoryLockKey`, роль из задачи 3.
- Produces:

```go
const (MinKeep = 4; DefaultKeep = 14)
type Report struct {
    Kept, Deleted int
    Offers, Mappings, RawProducts, SourceRuns int64
}
func New(conn *pgx.Conn, keep int) (*Pruner, error)   // nil conn или keep < MinKeep: ошибка
func (p *Pruner) Plan(ctx context.Context) (Report, error)  // только чтение, Deleted = число кандидатов
func (p *Pruner) Apply(ctx context.Context) (Report, error)
```

Кандидаты: снимки `status='published' AND "publishedAt" IS NOT NULL`, отсортированные `"publishedAt" DESC, id DESC`, с позиции `keep + 1`. Сортировка совпадает с `latestSnapshotSQL`. `Apply` берёт `pg_try_advisory_lock(ingestion.AdvisoryLockKey)`, при занятой блокировке возвращает `errors.New("ingestion already running")` и удаляет снимки от старых к новым, по одной транзакции на снимок, в порядке из Global Constraints. Блокировка снимается при выходе.

- [ ] **Step 1: Написать падающие тесты**

Unit `TestNewRejectsInvalidInput`: `New(nil, 14)` и `New(conn, 3)` возвращают ошибку.

Integration, фикстуры создаются через admin (магазин и категорию берём из миграций), `Pruner` работает под логином writer:
- `TestLocalRetentionDeletesOldest`: 6 снимков, `keep=4`. Остаются 4 новых; `Report{Kept:4, Deleted:2}`, счётчики строк совпадают с фикстурой; строки последнего снимка не изменились; `canonical_products` не изменились.
- `TestLocalRetentionPlanIsReadOnly`: `Plan` возвращает `Deleted:2`, число строк в базе не меняется.
- `TestLocalRetentionNoopWhenFewSnapshots`: 4 снимка, `keep=4`, `Deleted:0`, без ошибки.
- `TestLocalRetentionKeepsUnpublished`: старые снимки `building`, `validating`, `failed` остаются со своими строками.
- `TestLocalRetentionRefusesWhileIngestRuns`: другое соединение держит блокировку, `Apply` возвращает ошибку, строк не меньше.
- `TestLocalRetentionResumesAfterFailure`: admin ставит триггер на `source_runs`, поднимающий исключение для второго кандидата. `Apply` возвращает ошибку; первый кандидат удалён полностью, второй цел полностью. Триггер снят, повторный `Apply` завершает работу.

Имена начинаются с `TestLocalRetention`, чтобы попасть под фильтр из задачи 3.

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `cd backend-go && go test ./internal/retention/`
Expected: FAIL, `New` не определён.

- [ ] **Step 3: Реализовать `retention.go` по блоку Interfaces**

- [ ] **Step 4: Запустить unit- и integration-тесты**

Run: `cd backend-go && go test ./internal/retention/`, затем `node scripts/ci/run-db-integration.mjs` из корня репозитория.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend-go/internal/retention
git commit -m "feat(retention): prune published snapshots beyond the kept window"
```

### Task 5: Команда `cmd/prune`

**Files:**
- Create: `backend-go/cmd/prune/main.go`
- Test: `backend-go/cmd/prune/main_test.go`

**Interfaces:**
- Consumes: `retention.New`, `Plan`, `Apply`, `retention.DefaultKeep`.
- Produces: запуск `go run ./cmd/prune -keep 14 [-apply]`. Переменные: `APP_ENV`, `RETENTION_DATABASE_URL`, `RETENTION_PRODUCTION_APPLY_CONFIRM=1` (для `-apply` при `APP_ENV=production`). Код выхода 0 при успехе, 1 при ошибке. В stdout одна JSON-строка `{"applied":bool,"metrics":Report}`.

Структура повторяет `cmd/ingest/main.go`: `run()` со структурированным логом `retention_complete`, таймаут 5 минут, сигналы, проверка учётки. Проверка учётки: тот же запрос, что в ingest, с ролью `aktau_retention_writer`. Сессия: `SET statement_timeout='30s'; SET lock_timeout='5s'`, без `-apply` дополнительно `SET default_transaction_read_only=on`.

- [ ] **Step 1: Написать падающие тесты**

По образцу `TestConfigurationFailureStructuredPrivacy`:
- `TestConfigurationFailureStructuredPrivacy`: при невалидном `RETENTION_DATABASE_URL` секрет не попадает в stderr, есть `"error_code":"retention_configuration_failed"`;
- `TestKeepBelowMinimumRejected`: `-keep 3` падает до подключения к базе;
- `TestProductionApplyRequiresConfirm`: `APP_ENV=production`, `-apply`, без подтверждения падает до подключения.

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `cd backend-go && go test ./cmd/prune/`
Expected: FAIL, `run` не определён.

- [ ] **Step 3: Реализовать `backend-go/cmd/prune/main.go`**

- [ ] **Step 4: Запустить тесты и сборку**

Run: `cd backend-go && go test ./cmd/prune/ && go build ./...`
Expected: PASS. `Dockerfile` собирает только `cmd/api`, образ API не меняется.

- [ ] **Step 5: Commit**

```bash
git add backend-go/cmd/prune
git commit -m "feat(retention): add prune command"
```

### Task 6: Вызов из `daily-sync.sh` и документация

**Files:**
- Modify: `pipeline/scripts/daily-sync.sh`
- Modify: `ops/sync/aktau-sync.env.example`
- Modify: `ops/sync/README.md`
- Test: `scripts/ops/daily-sync.test.mjs`

**Interfaces:**
- Consumes: команда из задачи 5.
- Produces: новый код выхода `4` у `daily-sync.sh`: снимок опубликован, очистка упала. Новые необязательные переменные: `RETENTION_DATABASE_URL`, `RETENTION_KEEP_SNAPSHOTS` (по умолчанию 14), `RETENTION_PRODUCTION_APPLY_CONFIRM`.

Поведение после `trap - ERR`:
- `RETENTION_DATABASE_URL` пуст: строка `[sync] retention skipped`, код выхода не меняется;
- переменная задана: `go run ./cmd/prune -keep "${RETENTION_KEEP_SNAPSHOTS:-14}" -apply`;
- при ошибке команды: строка `[sync] retention failed` в stderr, скрипт продолжает работу;
- итоговый приоритет кодов: `3` (устаревшие сети) важнее `4`, `4` важнее `0`.

- [ ] **Step 1: Написать падающий тест**

Заглушка `go` получает отдельную ветку для `./cmd/prune` с кодом `$TEST_PRUNE_EXIT`, проверяемой раньше ветки `-apply`. Новые сценарии рядом с существующими:

| Сценарий | `RETENTION_DATABASE_URL` | Падает | Ожидаемый код | Вызовов `go` |
|---|---|---|---|---|
| `prune-success` | задан | ничего | 0 | 3 |
| `prune-failed` | задан | prune | 4 | 3 |
| `prune-failed-stale` | задан | prune и `scrape:dana` | 3 | 3 |
| `prune-skipped-on-apply-failure` | задан | ingest `-apply` | 1 | 2 |

Третья строка лога равна `run ./cmd/prune -keep 14 -apply|local`. Отдельный сценарий с `RETENTION_KEEP_SNAPSHOTS=20` проверяет `-keep 20`. В существующих сценариях `RETENTION_DATABASE_URL` явно пуст, число вызовов прежнее.

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `node --test scripts/ops/daily-sync.test.mjs`
Expected: FAIL на `prune-success`.

- [ ] **Step 3: Изменить `pipeline/scripts/daily-sync.sh`**

Добавить вызов и описать код 4 и переменные в шапке скрипта.

- [ ] **Step 4: Запустить тест**

Run: `node --test scripts/ops/daily-sync.test.mjs`
Expected: PASS.

- [ ] **Step 5: Обновить документацию**

`aktau-sync.env.example`: `RETENTION_DATABASE_URL=`, `RETENTION_KEEP_SNAPSHOTS=14`, `RETENTION_PRODUCTION_APPLY_CONFIRM=1`. `ops/sync/README.md`: строка про код `4` в таблице кодов выхода, раздел про хранение снимков и установку роли.

- [ ] **Step 6: Прогнать все локальные проверки**

Run: `node scripts/ci/run-checks.mjs ops`, `cd backend-go && go test ./...`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pipeline/scripts/daily-sync.sh ops/sync scripts/ops/daily-sync.test.mjs
git commit -m "feat(sync): prune old snapshots after publication"
```

---

## Часть C. Выкатка

### Task 7: Включение автоочистки

Начинать после завершения приёмки G3 (не раньше 2026-11-09). Нужны подтверждение владельца базы и согласование обновления VPS с командой. Код должен быть в `main`, CI 9/9.

**Files:** изменений в репозитории нет.

- [ ] **Step 1: Применить роль в Supabase**

Выполнить `aktau_retention_writer_role.sql` под `postgres` вне окна sync.
Expected: 10 новых политик. Запрос к `pg_policies` по `aktau_ingest_writer` показывает те же 17, что и раньше.

- [ ] **Step 2: Создать логин `aktau_retention_runtime`**

Пароль задаёт человек, в чат он не попадает.

```sql
CREATE ROLE aktau_retention_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '<задаёт человек>';
GRANT aktau_retention_writer TO aktau_retention_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
```

- [ ] **Step 3: Обновить код на VPS через bundle**

Порядок из `ops/sync/README.md`, вместо `git fetch` по https использовать bundle. Записать прошлый SHA для отката.
Expected: `git status --porcelain=v1` пуст, HEAD равен SHA из `main`.

- [ ] **Step 4: Проверить команду на VPS без изменений в базе**

Добавить в `/etc/aktau-sync.env` три переменные `RETENTION_*`. `RETENTION_DATABASE_URL` указывает на session pooler (порт 5432, логин `aktau_retention_runtime.<project_ref>`). Запустить `go run ./cmd/prune -keep 14` от `aktau-sync` с этим окружением.
Expected: JSON с `"applied":false` и `"Kept":14`.

- [ ] **Step 5: Дождаться естественного прогона**

Expected: в журнале нет `[sync] retention failed`, статус `SUCCESS`, опубликованных снимков 14, новый снимок на месте.

Откат: очистить `RETENTION_DATABASE_URL` в `/etc/aktau-sync.env`, вернуть прошлый SHA, выполнить rollback-скрипт роли, удалив перед этим логин. Удалённые снимки возвращаются только из дампа задачи 1.

### Task 8: Уменьшение размера в дашборде

Выполнять один раз после задачи 2. Рост останавливается и без этой задачи. Она снижает цифру в дашборде и даёт запас до лимита.

**Files:** изменений в репозитории нет.

- [ ] **Step 1: Выполнить `VACUUM FULL` вне окна sync**

Запускать по одной команде в SQL Editor. Каждая команда блокирует таблицу на время работы, запросы API в этот момент ждут.

```sql
SET lock_timeout='5s';
VACUUM FULL public.product_mappings;
VACUUM FULL public.offers;
VACUUM FULL public.raw_products;
```

- [ ] **Step 2: Проверить размер и работу API**

```sql
select pg_size_pretty(sum(pg_database_size(datname))) from pg_database;
```

Expected: около 130–140 МиБ, если задача выполнена сразу после очистки. `/api/dashboard` отвечает 200. Цифра в дашборде Supabase обновляется раз в сутки.
