# Реестр UUID товаров Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Товар, пропавший из снимков на любой срок, при возвращении получает свой прежний `canonicalProductId`, а не новый UUID.

**Architecture:** Новая постоянная таблица `product_identities` хранит последний UUID каждого товара магазина. Retention её не трогает. Чистая функция `restoreIdentities` перед `resolve` добавляет запомненный UUID только группам без голосов из последнего снимка, поэтому логика конфликтов в `resolve` не меняется. Реестр обновляется в транзакции публикации.

**Tech Stack:** Go 1.27, pgx v5, PostgreSQL 17 (Supabase), Prisma migrations, Node CI-скрипты.

**Spec:** `docs/superpowers/reports/2026-11-07-open-questions.md` в worktree `price-difference-analysis-0f90ee`, раздел 3. Гипотеза из отчёта подтверждена, данные ниже.

## Проверенные факты

Данные 14 снимков на 2026-11-07:
- Из 231 возвращения 218 получили новый UUID, 13 сохранили прежний через партнёра по группе. Смена UUID без пропуска: 0.
- С несколькими UUID: Dina 154 из 2 128, Dana 26 из 1 192, Анвар 7 из 1 631, Fix Price 0.
- В снимках всего 5 023 товара. `price_history`: 5 461 товар, у 339 больше одного UUID.
- Старый UUID отдаёт 404 в `/api/products/{id}`, новый отдаёт 200.
- Retention не удаляет `canonical_products`, поэтому внешний ключ реестра на карточку безопасен.

## Global Constraints

- Прод меняется только в Task 5 и только после отдельного решения владельца. Команды на VPS и миграции вводит человек, ключи и пароли агенту не передаются. Supabase `yowrsuztaadurovqvxmv` для агента только read-only SELECT.
- Сигнатуру `resolve` не менять.
- Запомненный UUID нельзя выдавать, если он есть среди голосов любой группы текущего bundle. Это сохраняет намеренные разделения карточек.
- Группа, у которой есть хотя бы один голос из последнего снимка, идёт по прежней логике.
- Запись реестра выполняется в той же транзакции, что и публикация снимка.
- Ошибки не содержат текст драйвера, как в остальном пакете.
- Имя миграции: `20261107000100_product_identities`.

## Review Focus

- Товар вынесли из карточки, пока он отсутствовал, а партнёр остался в снимке: вынесенный получает новый UUID, партнёр сохраняет старый.
- Оба участника карточки отсутствовали, а словарь их разделил: UUID получает первая группа в bundle, вторая новый, ingest не падает.
- Группа из двух вернувшихся товаров помнит разные UUID: выбирается UUID большинства, при равенстве меньший, `canonical_merge_conflict` не возникает.
- Публикация сорвалась после записи реестра: реестр откатывается вместе со снимком.
- Запуск с `-recluster`: восстановление не мешает разбору слияний и разделений.

---

### Task 1: Таблица и доступ

**Files:**
- Create: `backend/prisma/migrations/20261107000100_product_identities/migration.sql`
- Create: `ops/postgres/security/aktau_ingest_product_identities_access.sql`
- Create: `ops/postgres/security/rollback_aktau_ingest_product_identities_access.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `scripts/ci/postgres.mjs:43,50`
- Modify: `scripts/ci/run-db-integration.mjs`
- Modify: `backend-go/scripts/local-ingest-db.sh`
- Modify: `ops/sync/README.md`

**Interfaces:**
- Produces: таблица `public.product_identities`: `"storeId" TEXT`, `"sourceProductId" TEXT`, `"canonicalProductId" TEXT`, `"lastSeenAt" TIMESTAMP(3)`, все `NOT NULL`, PK `("storeId","sourceProductId")`
- Produces: CI-база `part14_identities` и логин `part14_writer` в группе `aktau_ingest_writer`

- [ ] **Step 1: Добавить модель `ProductIdentity` в `schema.prisma`**

По образцу `PriceHistory`: связи со `Store` и `CanonicalProduct` с `onDelete: Restrict`, `@@id([storeId, sourceProductId])`, `@@map("product_identities")`. Добавить обратные поля `productIdentities ProductIdentity[]` в обе модели.

- [ ] **Step 2: Написать миграцию**

DDL вывести через `prisma migrate diff`. В конец дописать блок включения RLS и `REVOKE` из миграции `20261107000000_price_history` с заменой имени таблицы.

- [ ] **Step 3: Написать файлы доступа по образцу `aktau_retention_price_history_access.sql`**

- Группа `aktau_ingest_writer`, права `SELECT,INSERT,UPDATE`.
- Политики: `aktau_ingest_writer_select` (`USING (true)`), `aktau_ingest_writer_insert` (`WITH CHECK (true)`), `aktau_ingest_writer_update` (`USING (true) WITH CHECK (true)`).
- Rollback проверяет ровно 3 политики и 3 права, затем удаляет их. Таблицу и данные не трогает.
- В заголовке rollback указать: запускать до `rollback_aktau_ingest_writer_access.sql`, потому что тот ждёт ровно 17 политик.

- [ ] **Step 4: Обновить CI и локальную БД**

- `scripts/ci/postgres.mjs`: добавить `part14_identities` в `databases`, дописать миграцию в конец цепочки в строке с `migration chain mismatch`.
- `scripts/ci/run-db-integration.mjs`: в конце, перед закрытием `postgres(...)`, применить к `part14_identities` файлы `aktau_ingest_writer_role.sql` и новый access, создать `login('part14_writer', 'aktau_ingest_writer')`. Отдельная база нужна, потому что `TestLocalSnapshotSecurity` откатывает роль в `part08`. Затем удалить логин, применить оба rollback в обратном порядке и проверить, что `aktau_ingest_writer` удалена так, как это сделано для retention.
- `backend-go/scripts/local-ingest-db.sh`: добавить миграцию после `price_history`, а новый access-файл применять после неё.

- [ ] **Step 5: Описать порядок в `ops/sync/README.md`, новый раздел после «История цен по месяцам»**

Назначение таблицы, порядок установки (миграция, access, backfill, потом код) и порядок отката доступа.

- [ ] **Step 6: Проверить цепочку**

Run: `node scripts/ci/run-db-integration.mjs` (нужен Docker)
Expected: PASS, ошибки `migration chain mismatch` нет, роль после rollback удалена. Если тест с точным списком таблиц падает на новой таблице, добавить её в этот список.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma ops/postgres/security ops/sync/README.md scripts/ci backend-go/scripts/local-ingest-db.sh
git commit -m "feat(db): add product identity registry table and writer access"
```

---

### Task 2: Функция восстановления UUID

**Files:**
- Create: `backend-go/internal/ingestion/restore.go`
- Create: `backend-go/internal/ingestion/restore_test.go`
- Modify: `backend-go/internal/ingestion/plan.go:9-21`

**Interfaces:**
- Produces: `func restoreIdentities(b Bundle, previous map[Identity][]string, remembered map[Identity]string) (map[Identity][]string, int)`. Возвращает копию `previous` с добавленными голосами и число восстановленных групп. Входной `previous` не меняется.
- Produces: `Report.RestoredCanonical int` с JSON-ключом `restoredCanonicalCount`. Такие группы также входят в `ReusedCanonical`.

- [ ] **Step 1: Написать падающие тесты в `restore_test.go`**

Использовать хелперы `raw`, `group`, `bundleOf`, `cats` из `plan_test.go`. Каждому bundle нужны товары всех четырёх сетей, как в `TestResolveStrictStillRejectsMerge`.

```go
func TestRestoreGivesReturnedProductItsID(t *testing.T) {
	a, f, d, n := raw("DINA", "1"), raw("FIX_PRICE", "3"), raw("DANA", "2"), raw("ANVAR", "5")
	b := bundleOf(group(a), group(f), group(d), group(n))
	prev, restored := restoreIdentities(b, nil, map[Identity]string{a.Identity(): "OLD"})
	out, rep, err := resolve(b, prev, nil, cats, 100, false)
	if err != nil || restored != 1 || out[0].ID != "OLD" || !out[0].Reused || rep.NewCanonical != 3 {
		t.Fatalf("got %v %d %+v %+v", err, restored, out[0], rep)
	}
}
```

Ещё тесты, условия проверки указаны для каждого:

| Тест | Вход | Ожидание |
|---|---|---|
| `TestRestoreSkipsIDHeldByCurrentVote` | `a` в `previous` с `X`, отдельная группа `d` помнит `X` | `d` получает новый UUID, `restored == 0`, ошибки нет |
| `TestRestoreSkipsGroupWithVotes` | группа `(a, d)`, `a` голосует за `X`, `d` помнит `Y` | группа получает `X`, ошибки `canonical_merge_conflict` нет |
| `TestRestoreFirstGroupWinsSharedID` | группы `a` и `d` помнят `X`, голосов нет | первая получает `X`, вторая новый UUID, ошибки нет |
| `TestRestoreMajorityWins` | группа из трёх: двое помнят `B`, один `A` | группа получает `B`, ошибки нет |
| `TestRestoreTieTakesSmallestID` | группа из двух: один помнит `B`, другой `A` | группа получает `A`, ошибки нет |
| `TestRestoreUnderRecluster` | как в первом тесте, `recluster=true` | результат тот же, `MergedCanonical == 0`, `SplitCanonical == 0` |
| `TestRestoreDoesNotMutatePrevious` | непустой `previous` | длина и значения входной карты не изменились |

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend-go && go test ./internal/ingestion -run TestRestore`
Expected: FAIL, `undefined: restoreIdentities`.

- [ ] **Step 3: Реализовать `restoreIdentities`**

Алгоритм:
1. Собрать `claimed`: все ID из `previous` для участников всех групп bundle.
2. Для групп по порядку bundle: пропустить группу, если у любого участника есть запись в `previous`.
3. Посчитать запомненные ID участников, исключив `claimed` и уже выданные.
4. Выбрать ID с наибольшим числом участников, при равенстве меньший.
5. Записать его в копию `previous` только тем участникам, которые его помнят, пометить как выданный, увеличить счётчик.

- [ ] **Step 4: Добавить поле `RestoredCanonical` в `Report`**

- [ ] **Step 5: Убедиться, что тесты пакета проходят**

Run: `cd backend-go && go test ./internal/ingestion`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend-go/internal/ingestion/restore.go backend-go/internal/ingestion/restore_test.go backend-go/internal/ingestion/plan.go
git commit -m "feat(ingest): restore remembered identities for groups without votes"
```

---

### Task 3: Подключить реестр к ingest

**Files:**
- Modify: `backend-go/internal/ingestion/ingestor.go:88-95,146-172,201,348,424-427`
- Modify: `backend-go/cmd/ingest/main.go:34`
- Create: `backend-go/internal/ingestion/identity_integration_test.go`
- Modify: `scripts/ci/run-db-integration.mjs`

**Interfaces:**
- Consumes: `restoreIdentities`, `Report.RestoredCanonical`, таблица и логин `part14_writer` из Task 1
- Produces: `baseline.Remembered map[Identity]string`
- Produces: `func (e *Ingestor) plan(b Bundle, previous baseline) ([]resolved, Report, error)`, общая обёртка вызова `restoreIdentities` и `resolve` для `dryRun` и `stage`. Записывает `RestoredCanonical` в отчёт и при ошибке.

- [ ] **Step 1: Написать падающий интеграционный тест `TestLocalIdentityRegistry`**

Файл с тегом `integration`. Переменные: `TEST_IDENTITY_ADMIN_DATABASE_URL` и `TEST_IDENTITY_WRITER_DATABASE_URL`, тест пропускается без них и проверяет цель так же, как `localTarget`, но с базой `part14_identities`. Ingest запускается под логином писателя, чтобы проверить права. Сценарий на bundle из четырёх сетей:

| Шаг | Действие | Проверка |
|---|---|---|
| 1 | Опубликовать bundle с товарами A, B, C, D | в реестре 4 строки |
| 2 | Запомнить UUID товара A, опубликовать bundle без A | строка A в реестре осталась, UUID тот же |
| 3 | `DryRun` с A | `RestoredCanonical == 1`, отпечаток таблицы реестра и снимков не изменился |
| 4 | Опубликовать bundle с A | у A прежний UUID, `NewCanonical == 0` |
| 5 | `Stage`, затем под админом `UPDATE snapshots SET status='building' WHERE id=<staged.id>`, затем `Publish`. Финальный `UPDATE` затронет 0 строк уже после записи реестра | `Publish` падает, `lastSeenAt` в реестре не изменился |

- [ ] **Step 2: Добавить вызов в `run-db-integration.mjs`**

Перед удалением логина из Task 1: `go(['test', '-count=1', '-race', '-tags=integration', './internal/ingestion', '-run', '^TestLocalIdentityRegistry$', '-v'], {...})` с обоими URL.

- [ ] **Step 3: Убедиться, что тест падает**

Run: `node scripts/ci/run-db-integration.mjs`
Expected: FAIL на шаге 1, в реестре 0 строк.

- [ ] **Step 4: Читать реестр в `baseline`**

Добавить поле `Remembered`. Запрос выполняется всегда, даже без опубликованного снимка:

```sql
SELECT st.code::text,i."sourceProductId",i."canonicalProductId" FROM product_identities i JOIN stores st ON st.id=i."storeId"
```

Ошибка: `errors.New("ingestion identity registry unavailable")`.

- [ ] **Step 5: Заменить оба вызова `resolve` на `e.plan`**

- [ ] **Step 6: Писать реестр в `publish`**

После `writes.flush` и до `UPDATE snapshots` выполнить в той же транзакции. При ошибке `return fail()`. `Bundle.Validate` запрещает дубли товара, поэтому `ON CONFLICT` не встретит одну строку дважды.

```sql
INSERT INTO product_identities("storeId","sourceProductId","canonicalProductId","lastSeenAt")
SELECT r."storeId",r."sourceProductId",m."canonicalProductId",timezone('UTC',clock_timestamp())
FROM raw_products r JOIN product_mappings m ON m."rawProductId"=r.id WHERE r."snapshotId"=$1
ON CONFLICT("storeId","sourceProductId") DO UPDATE SET "canonicalProductId"=EXCLUDED."canonicalProductId","lastSeenAt"=EXCLUDED."lastSeenAt"
```

- [ ] **Step 7: Добавить `"restored_count", report.RestoredCanonical` в лог `cmd/ingest/main.go:34`**

- [ ] **Step 8: Убедиться, что всё проходит**

Run: `cd backend-go && go test ./... && cd .. && node scripts/ci/run-db-integration.mjs`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend-go scripts/ci/run-db-integration.mjs
git commit -m "feat(ingest): keep product identities across snapshot gaps"
```

---

### Task 4: Заполнение реестра

**Files:**
- Create: `ops/postgres/backfill-product-identities.sql`
- Modify: `backend-go/internal/ingestion/identity_integration_test.go`
- Modify: `ops/sync/README.md`

**Interfaces:**
- Consumes: таблица из Task 1
- Produces: идемпотентный скрипт владельца базы

- [ ] **Step 1: Написать падающий тест `TestLocalIdentityBackfill`**

Под админом: вставить товар X только в `price_history` с двумя месяцами и разными UUID, товар Y в `price_history` со старым UUID и в опубликованный снимок с новым. Прочитать файл `ops/postgres/backfill-product-identities.sql` и выполнить дважды. Проверки: X указывает на UUID более позднего месяца, Y на UUID из снимка, вторая прогонка не меняет данные реестра. Тест запускается той же командой CI, добавить его в регулярное выражение `-run`.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node scripts/ci/run-db-integration.mjs`
Expected: FAIL, файла нет.

- [ ] **Step 3: Написать скрипт**

Одна транзакция, `lock_timeout='5s'`, два шага:
1. Из `price_history`: `DISTINCT ON ("storeId","sourceProductId")` с сортировкой `month DESC,"capturedAt" DESC`, `lastSeenAt = "capturedAt"`, `ON CONFLICT DO NOTHING`.
2. Из опубликованных снимков: `DISTINCT ON ("storeId","sourceProductId")` с сортировкой `"publishedAt" DESC,s.id DESC`, `lastSeenAt = "publishedAt"`, `ON CONFLICT DO UPDATE` обоих полей.

Снимки идут вторыми, потому что они свежее истории.

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `node scripts/ci/run-db-integration.mjs`
Expected: PASS.

- [ ] **Step 5: Добавить команду запуска в раздел `ops/sync/README.md` из Task 1 и закоммитить**

```bash
git add ops/postgres/backfill-product-identities.sql ops/sync/README.md backend-go/internal/ingestion/identity_integration_test.go scripts/ci/run-db-integration.mjs
git commit -m "feat(ops): add product identity backfill"
```

---

### Task 5: Выкладка на прод

Выполняет человек после отдельного решения. Агент готовит команды и проверяет результат через read-only SELECT. Нельзя начинать во время sync: прогоны идут в 01:00 и 13:00 UTC. Порядок важен: новый код без таблицы уронит ingest на чтении реестра, а старый код таблицу не замечает.

- [ ] **Step 1: Смержить PR с зелёным CI, записать SHA и текущий SHA на VPS для отката**

- [ ] **Step 2: Применить миграцию**

Из `backend`: `pnpm exec prisma migrate status`. Expected: ровно одна неприменённая миграция, `20261107000100_product_identities`. Затем `pnpm exec prisma migrate deploy` с `DIRECT_URL`.

- [ ] **Step 3: Применить `aktau_ingest_product_identities_access.sql` и backfill от имени владельца**

- [ ] **Step 4: Проверить реестр**

Expected: строк не меньше, чем товаров в хранимых снимках (на 2026-11-07 было 5 023). Запрос ниже возвращает 0, то есть все товары последнего снимка указывают на его UUID.

```sql
SELECT count(*) FROM raw_products r JOIN product_mappings m ON m."rawProductId"=r.id
LEFT JOIN product_identities i ON i."storeId"=r."storeId" AND i."sourceProductId"=r."sourceProductId"
WHERE r."snapshotId"=(SELECT id FROM snapshots WHERE status='published' ORDER BY "publishedAt" DESC LIMIT 1)
AND i."canonicalProductId" IS DISTINCT FROM m."canonicalProductId";
```

- [ ] **Step 5: Обновить VPS по разделу «Обновление кода на VPS» в `ops/sync/README.md`**

Репозиторий приватный, поэтому код доставляется через bundle. Если между Step 3 и этим шагом прошёл sync, сначала ещё раз выполнить backfill: старый код реестр не обновляет.

- [ ] **Step 6: Строгий dry-run без `-recluster`**

Expected: `failureCode` нет, `mergedCanonicalCount` и `splitCanonicalCount` равны 0. Записать `restoredCanonicalCount` и `newCanonicalCount`. Если есть `failureCode` или merge и split не нули, откатиться и не публиковать.

- [ ] **Step 7: Дождаться естественного прогона и проверить**

Expected: exit 0, запрос из Step 4 снова даёт 0, в `qualityReport` снимка есть `restoredCanonicalCount`. Через 2–3 прогона повторить запрос по возвращениям из анализа, взяв только снимки после выкладки. Возвращений с новым UUID должно быть 0, кроме случаев, когда прежний UUID занят другой группой.

**Откат:** checkout записанного SHA на VPS. Таблица, права и данные остаются и старому коду не мешают. При повторной выкладке снова выполнить backfill: он обновит реестр по снимкам, опубликованным за время отката.
