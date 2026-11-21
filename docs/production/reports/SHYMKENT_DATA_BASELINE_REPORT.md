# Данные Шымкента, часть 1: открытый код сети и новая база (Magnum)

**Статус — READY_FOR_REVIEW.** Ссылка на PR, итоговый HEAD и выводы GitHub Actions по точному
HEAD записываются отдельно от этого отчёта, после публикации. Отчёт не утверждает будущий
успех CI.

Ветка `feat/shymkent-data-baseline` убирает из репозитория данные и код Актау, заменяет
закрытый список сетей открытым кодом, заменяет унаследованную цепочку миграций новой базой
Шымкента и оставляет единственную сеть — Magnum. Деплоя, записей в production и живого скрапинга
в этой задаче нет; запись в БД выполнялась только в одноразовый локальный PostgreSQL.

Роль: Backend 2. Спецификация: `docs/superpowers/specs/2026-11-21-shymkent-data-design.md`.
План: `docs/superpowers/plans/2026-11-21-shymkent-data-part1-open-store-baseline.md`.

## База и коммиты

| Проверка | Результат |
| --- | --- |
| База | `main` `3ccb0d5` (merge PR #3 и #4, каркас парсеров и Magnum). |
| Спецификация и план | `d02420b`, `7e2f9ed`. |
| Коммиты задач | `7e2f9ed..e066186` — 15 коммитов (задачи 1–10, включая исправления по ревью). |
| Рабочее дерево | отдельный worktree, Windows, Git Bash; ветка `feat/shymkent-data-baseline`. |
| Размер | 220 файлов, +2637 / −144038 строк относительно `7e2f9ed` (основная часть — удаление данных и документов Актау). |

## Изменённые области

| Область | Что изменилось |
| --- | --- |
| `backend/prisma` | 12 унаследованных миграций заменены базой `20261122000000_shymkent_baseline` и миграцией `20261122000001_shymkent_taxonomy`; `StoreCode` из enum стал строкой; `stores."sortOrder"`. |
| `pipeline` | удалены адаптеры и данные прочих сетей и путь Gemini; Magnum — весовые цены (`isWeighted`) и картинки; словарь Шымкента начат с категорий Magnum; таксономия генерируется из словаря. |
| `backend-go` | Go API и `cmd/ingest` принимают любой зарегистрированный код сети; фикстуры и тесты на `STORE_A`, `STORE_B`, `MAGNUM`. |
| `contracts` | `StoreCode` описан как строка по шаблону `^[A-Z][A-Z0-9_]{1,31}$`, а не закрытый enum. |
| `frontend` | показываются Magnum и любая зарегистрированная сеть (15 файлов). |
| `scripts/ci`, `scripts/deploy`, `scripts/ops`, `scripts/perf`, `ops` | список цепочки миграций, защита миграций (разовое разрешение базы), `SYNC_STORES=MAGNUM`, снят недельный полный синк; роли и юниты не переименованы. |
| `docs`, `data` | удалены документы и данные Актау (ниже); `SYNC_RUNBOOK.md` переписан под локальный поток Шымкента. |

## Сравнение схем (задача 2)

Старая цепочка из `main` и новая база применены в двух одноразовых базах `postgres:17-alpine`,
сделаны выгрузки `pg_dump --schema-only` вместе с правами, политиками и RLS. Различия только
ожидаемые:

1. случайные токены `\restrict` / `\unrestrict` pg_dump — не схема;
2. исчез `CREATE TYPE "StoreCode"` (DINA, DANA, FIX_PRICE, ANVAR);
3. `stores.code` стал `text` с проверкой `stores_code_check` (шаблон кода), добавлен `"sortOrder" integer NOT NULL DEFAULT 100`;
4. `offer_price_basis`: ветки `DINA/DANA/ANVAR` заменены на `CASE s.code WHEN 'MAGNUM'` с `rawPayload.isWeighted` и `basisGrams = 1000`; список столбцов и типы те же.

Остальное совпало: таблицы, столбцы, индексы, внешние ключи, права, политики, RLS.
`prisma migrate diff` по обеим базам — пусто. Перенос данных в `snapshot_history` (проверка и
`INSERT`/`UPDATE` для заполненной базы) в новую базу не перенесён: на пустой базе он ничего не
делает и на схему не влияет. Строки: в старой цепочке была сеть ANVAR, 3 локации и 12
категорий; в новой — строка Magnum, 0 локаций, категории приходят из миграции таксономии.

## Проверка на одноразовой БД

Запись шла только в новый контейнер `postgres:17-alpine` (PG 17.11), порт только на
`127.0.0.1`; перед записью проверено `current_database()`, `inet_server_addr()`, `current_user`.
Контейнер удалён по завершении (`docker rm -f -v`), других не осталось. Строки подключения и
пароли не выводились. Живой скрапинг не запускался: взят локальный `magnum.json` прогона
2026-11-21 (в `.gitignore`, в PR не входит).

Порядок: роль чтения → `prisma migrate deploy` (база + таксономия) → роль записи `aktau_ingest_writer`
и доступ к реестру идентичности → вход ограниченной роли → `SYNC_STORES=MAGNUM
SYNC_MAX_SOURCE_AGE_HOURS=720 pnpm sync` → `cmd/ingest` dry-run → `-apply` → `ANALYZE`.

| Показатель | Значение |
| --- | --- |
| Миграции | обе применены; в `categories` 12 строк, в `stores` одна (Magnum) |
| `pnpm sync` | 1383 raw-товара Magnum, ошибок 0; в `magnum.json` 1403 товара, разницу в 20 отсёк сам `sync` |
| `cmd/ingest` dry-run | PASS; `rawCount 1383`, `canonicalCount 1383`, нужные сети — только `MAGNUM` |
| `cmd/ingest -apply` | PASS; один снимок `4ff3460b-7dd6-41c2-b3e3-7f90df5453a8` со статусом `published`; рассылка инвалидации кэша деградировала (адреса нет — ожидаемо локально) |
| Офферов в снимке | 1383 |
| Весовых по `offer_price_basis` (`soldByWeight`) | 214, у всех `basisGrams = 1000` |
| Весовых в `magnum.json` (`rawPayload.isWeighted === true`) | 214 — совпадает |
| Категории канонических товаров | только категории Magnum: dairy 470, groats 345, meat 125, tea-coffee 111, vegetables 100, fish 78, milk 45, bread 40, sugar 30, eggs 25, oil 9, salt 5; категории `other` нет |

Все 1383 товара попадают в `unmapped` и в «ожидает проверки»: словарь Шымкента нарочно начат с
категорий Magnum, сопоставление с товарами СЗПТ — часть 2. Совпадений между сетями нет (сеть одна).

## Поиск остатков Актау

`rg -n "\b(DINA|DANA|FIX_PRICE|ANVAR)\b" pipeline backend backend-go contracts frontend ops scripts data`
(без `node_modules`, `.next`, `data/sources`, `data/sync`; документы других команд, исторические
отчёты и спецификация/планы этого проекта в область не входят). Остались два совпадения:

| Место | Вердикт |
| --- | --- |
| `contracts/tests/contract.test.mjs:333` | допустимо: список старых кодов, которые тест проверяет как отсутствующие |
| `frontend/src/lib/stores.test.ts:33` | остаток Актау в тесте области Frontend (`DINA` с адресом Актау); строка только в данных теста, на работу не влияет, передан Frontend |

## Решения

- **Открытый код сети.** Один шаблон `^[A-Z][A-Z0-9_]{1,31}$` везде: CHECK в БД, Go, pipeline, контракт. Заводить новую сеть — строка в `stores` и запись источника, без миграции enum.
- **Правило набора сетей при ingest (R3).** Бандл без `sourceRuns` по-прежнему допустим; если `sourceRuns` есть, набор их кодов должен совпадать с набором `stores.code` — как и было, без расширения.
- **Таксономия: только добавление и правило времени (R13).** Миграции таксономии генерируются из словаря и только добавляют; метка времени новой миграции — позднее из «сейчас» и «последняя миграция + 1 с», потому что база датирована 2026-11-22, а сегодня 2026-11-21, и Prisma применяет по имени.
- **База миграций заменена целиком.** Разовое исключение в защите миграций (`f0e442a`, `8c7f790`) разрешает только этот путь базы; новые миграции в список автотранспорта (`scripts/deploy/auto-transport.mjs`) не добавлялись.
- **Весовой Magnum — только по полям источника** (`rawPayload.isWeighted`), не по названию; `basisGrams` 1000.
- **Документы.** Удалено 23 файла: `docs/backend-2/*` (3); `docs/data/*` кроме `SYNC_RUNBOOK.md` (10: источники и отчёты по прочим сетям, SCRUM-7); планы `scrum-7-anvar-full-catalog`, `scrum-7-review-fixes`, `fast-price-sync`, `dana-fast-scrape`, спецификация `fast-price-sync-design`; планы `scrum-19-milk-category`, `sochni-hide`, `dict-apply-applied-marker`; отчёты `2026-11-09-outdated-docs-audit`, `PRODUCTION_HANDOFF`. Оставлено: design-system, c2-removal, snapshot-retention, monthly-price-history, product-identity-registry, legacy-nest-removal, monitor-delivery, scrum-25-szpt, szpt-weighted, szpt-phase3, async-scrapers-core, спецификации и планы «Данных Шымкента». Ссылки в `docs/README.md` и спецификации monitor-delivery исправлены, `SYNC_RUNBOOK.md` переписан.

## Проверки

Локальный CI — `node C:/Development/AdilBaga-local-ci/run-local.mjs` (Linux-контейнер, все
группы; прямой `node scripts/ci/run-checks.mjs` не запускался, на этом хосте нет python3).

| Группа локального CI | Результат |
| --- | --- |
| contracts | PASS, 5 с |
| go | PASS, 56 с |
| schema | PASS, 11 с |
| pipeline | PASS, 5 с |
| frontend | PASS, 73 с |
| guard | PASS, 1 с |
| security | PASS, 8 с |
| ops | PASS, 12 с |
| postgres (run-db-integration) | PASS, 26 с |
| staging (run-ephemeral-staging) | PASS, 32 с |

Итог: все 10 групп PASS, код выхода 0, на HEAD  (до коммита отчёта).

| Другая проверка | Результат |
| --- | --- |
| Сравнение схем старой и новой базы (задача 2) | PASS — только ожидаемые различия |
| `prisma validate`, `prisma format --check` | PASS |
| `node --test scripts/ci/migration-guard.test.mjs` | PASS — 11/11 |
| Проверка на одноразовой БД: миграции, роли, `pnpm sync`, `cmd/ingest` dry-run и `-apply`, `ANALYZE` | PASS (цифры выше) |
| Шаги, которым нужен python3 (`run-checks.mjs` напрямую) | NOT_RUN локально; те же скрипты выполнил локальный CI в Linux |
| `scripts/ops/daily-sync.test.mjs` | NOT_RUN локально (не проходит на Windows по среде); выполняется CI на PR |
| Opt-in Go-тесты `TestLocalSnapshotPublication` и два теста жизненного цикла раскатки чтения | NOT_RUN |
| Эталоны parity (`backend-go`) | отредактированы вручную, не записаны заново: перезапись падает на голосовом follow-up (503) |
| Живой скрапинг | NOT_RUN — не входит в задачу |
| GitHub Actions на точном HEAD | Записывается отдельно после публикации. |

## Риски и ограничения

- **Совместимость клиентов.** Код сети в API теперь строка по шаблону, а не закрытый enum; клиенты с жёстким enum должны принимать новые коды. Контракт и `API_V1_CONTRACT.md` это описывают.
- **Имена Актау не переименованы.** Роли `aktau_*`, юниты `ops/sync/aktau-sync*`, пакет `adilbaga-pipeline`, модуль Go `adilbaga/backend-go` оставлены намеренно; переименование — отдельная задача с инфраструктурой.
- **Остатки Актау для других команд.** Frontend: `generate-og.mjs` (названия прочих сетей), списки сетей в i18n ru/kk, заголовки безопасности с хостами CDN, блог; тест `stores.test.ts` (адрес Актау), переменные `dina/fix` в `DashboardPage.test.tsx`, идентификаторы `szpt-potatoes-dina/dana` в `szpt.json`. Контракт: демонстрационный адрес «Актау» в примерах `dashboard.json` и `voice-start-result.json`, заголовок OpenAPI «Aktau Market API» (унаследован, оговорен в README). Go: координаты Актау в фикстуре `catalog.sql` и эталонах parity. Ops: фикстуры `sync-report` на старых названиях сетей, бренд и часовой пояс Актау в env-примере.
- **Мелкие замечания ревью, отложенные.** `ORDER BY s.code` без `COLLATE "C"` в `dashboard.go`, `locations.go`, `freshness.go`; допуск строки `"true"` в `isWeighted` в SQL (парсер выдаёт только булево); нет теста соответствия словаря и сида области Magnum; в `pipeline_bundle.json` (генерируется) пара DINA→STORE_B — синтетика.
- **Данные Magnum.** Один склад (даркстор); СЗПТ-группы «рыба» и «яйца I категории» без совпадений — работа части 2.
- **GitHub Actions** на этом HEAD ещё не запускались; workflows не менялись, релизные задания остаются закрытыми условием репозитория.

## Условие остановки этапа

Этап закончен, когда PR прошёл независимое ревью со статусом APPROVED, CI на точном HEAD
зелёный и Owner отдельно разрешил слияние. Push, PR, слияние, деплой и включение синхронизации
требуют отдельного разрешения Owner.
