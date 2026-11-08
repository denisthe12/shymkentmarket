# Вывод legacy NestJS из репозитория и CI — дизайн

Дата: 2026-11-08. База: `main` ffc0bc4. Решение о подходе: вариант B, два шага; согласование шага 2 — за Backend 2 (root на VPS, отдельное согласование не требуется).

## 1. Зачем

Продакшен давно обслуживает Go API. NestJS (`backend/`) остался только как эталон для parity-тестов, и из-за этого каждое изменение поведения Go дублируется в Nest: с 2026-10-01 — 11 коммитов в Nest на 45 в `backend-go/internal` (например, af55819, 2b3bd82, f6f8e6c; PR #103 пришлось обходить старый поиск Nest). Время CI здесь ни при чём: джоба `Nest Reference` идёт 21 с параллельно с остальными (run 42408276613).

Цель: убрать Nest-приложение и необходимость дублирования, сохранив защиту frozen v1 wire-контракта и не затрагивая продакшен.

Критерии успеха:

- в репозитории нет Nest-приложения и Nest-зависимостей; `backend/` содержит только Prisma-схему, миграции, security SQL и минимальный `package.json`;
- изменение поведения Go не требует правок вне `backend-go/` (кроме обновления записанного эталона и контрактов, если меняется wire-формат);
- пять CI parity-тестов продолжают проверять Go против зафиксированного эталона, а не пропускаются;
- продакшен-образ, Go-код в `internal/`, миграции и процесс их применения не меняются.

## 2. Факты, на которых стоит дизайн

Проверено 2026-11-08 (репозиторий и вывод с VPS):

- На VPS нет node/pm2-процессов; единственный API — контейнер `adilbaga-api:e50de25` на `127.0.0.1:8080`, cloudflared отправляет `api.aktau.market` туда. `/opt/aktau-sync/backend` — только исходники в checkout'е (688K, без `node_modules`, `dist`, `.env`).
- Продовые миграции применяются `pnpm exec prisma migrate deploy` из `backend/` с машины разработчика (на VPS для этого нет `node_modules`, в истории shell нет prisma).
- `backend/prisma` используется: `scripts/ci/postgres.mjs` (migrate deploy в 7 БД, точная цепочка миграций), `scripts/ci/check-source.mjs` (неизменяемость миграций), `scripts/deploy/auto-transport.mjs` (protected path и хэши), `pipeline/` тесты, `backend-go/scripts/local-ingest-db.sh`, perf-скрипты, `ops/` документация.
- Nest-приложение используется только: джобой `Nest Reference` (`run-checks.mjs nest`) и Ephemeral Staging (сборка, запуск на `:13000`, `REFERENCE_API_BASE_URL` для пяти parity-тестов, `contracts test:live` по обоим origin).
- Пять CI parity-тестов (`TestHTTPParity`, `TestLocalSecurityQueryParity`, `TestLocalContentTypeParity`, `TestLocalCategoryVisibilityParity`, `TestLocalVoiceParity`) шлют одинаковые запросы в Go и в эталон и сравнивают ответы; без эталона делают `t.Skip`. Данные детерминированы: `backend-go/tests/fixtures/catalog.sql` + `scripts/ci/fixtures/voice-parity-overlay.sql`, Gemini выключен (`voice.Fallback`).
- `scripts/deploy/auto-gate.mjs`: `verifyCI` требует ровно 9 джоб и каждое имя из `mandatory`, где есть `Nest Reference`. Локальный CI (`C:\Development\AdilBaga-local-ci\run-local.mjs`) знает группу `nest`.
- Старые скраперы `backend/src/modules/import` заменены `pipeline/`; ссылок из `pipeline/scripts` на `backend/` нет.

## 3. Записанный эталон (reference cassette)

### 3.1 Что это

Тестовый помощник в `backend-go/tests/integration/reference_test.go` (build tag `integration`), который возвращает адрес эталона для parity-теста:

```go
func referenceBase(t *testing.T) string
```

Поведение:

| `REFERENCE_API_BASE_URL` | `REFERENCE_RECORD` | Результат |
|---|---|---|
| задан | пусто | как сейчас: живой эталон по этому адресу |
| задан | `1` | `httptest`-прокси к живому эталону; каждый обмен записывается; при `t.Cleanup` файл записи перезаписывается |
| пусто | пусто | `httptest`-сервер, отвечающий из файла записи (replay) |
| пусто | `1` | `t.Fatal` — записывать не с чего |

Проверка loopback для заданного `REFERENCE_API_BASE_URL` остаётся как сейчас.

### 3.2 Файл записи

- Один файл на тест: `backend-go/tests/integration/testdata/reference/<TestName>.json`.
- Формат: JSON-массив обменов в порядке записи: `{"method","path","contentType","body","status","responseContentType","response"}`. `path` — путь с query как отправлен; `body` — строка тела запроса (пустая для GET); `response` — тело ответа строкой, без переформатирования.
- Ключ сопоставления: `method` + `path` + `contentType` + `body`. Content-Type входит в ключ, потому что `TestLocalContentTypeParity` шлёт одно тело с разными типами.
- Повторяющиеся ключи проигрываются по порядку (счётчик на ключ): так работают voice-сессии с `start`/`continue`, где эталон возвращает записанный `sessionId`, тест отправляет его обратно и тело совпадает с записанным.
- Replay строгий: запрос, которого нет в записи (или исчерпан счётчик ключа), — ответ 599 и `t.Error` с методом и путём (без тела, чтобы не светить voice-маркеры в логах). При `t.Cleanup` неиспользованные обмены — `t.Error` («stale reference entry»), чтобы запись не расходилась с тестом.
- Файлы форматируются стабильно (`json.MarshalIndent`, два пробела, перевод строки в конце), чтобы diff в PR был читаемым.

### 3.3 Изменения в тестах

В пяти тестах `os.Getenv("REFERENCE_API_BASE_URL")` заменяется на `referenceBase(t)`, условие `t.Skip` при пустом эталоне убирается (эталон теперь есть всегда). `HTTP_PARITY_CONFIRM`, проверки loopback и вся логика сравнения остаются без изменений. Комментарии «Nest» в тестах заменяются на «reference».

### 3.4 Как обновлять запись после удаления Nest

Когда поведение API меняется намеренно, запись обновляется из самого Go: Go API запускается на фикстуре, тест запускается с `REFERENCE_API_BASE_URL=<Go>` и `REFERENCE_RECORD=1`. Изменения записи видны в diff PR и ревьюятся как изменение wire-контракта. Если меняется формат v1, вместе с записью обновляются `contracts/openapi.yaml` и `contracts/examples`. Процедура описывается в `backend-go/README.md`.

## 4. Шаг 1 — один PR, без изменений деплой-кода

### Push 1: доказать, что запись совпадает с Nest

1. Добавить `reference_test.go` и правки пяти тестов (раздел 3).
2. Записать пять файлов с живого Nest на локальном одноразовом стенде, повторяющем Ephemeral Staging (PG17 + миграции + `catalog.sql` + overlay, Nest на `:13000`, Go на `:18080`).
3. Запись делается дважды подряд; если файлы различаются, найденное поле нормализуется (по образцу `equalHTTPProducts`) до коммита.
4. В `scripts/ci/run-ephemeral-staging.mjs` parity-тесты запускаются два раза: с `REFERENCE_API_BASE_URL` = живой Nest и с пустым (replay). Оба должны пройти.

Зелёный CI на этом push'е — доказательство, что запись эквивалентна живому Nest.

### Push 2: удалить Nest

1. Удалить `backend/src`, `backend/test`, `backend/scripts`, `backend/prisma/seed.ts`, `backend/tsconfig.json`.
2. `backend/package.json`: единственная зависимость — `prisma` 5.22.0 (devDependency, версия не меняется); единственный скрипт — `db:migrate` (`prisma migrate dev`, для создания новых миграций). Остальные команды вызываются напрямую, как в текущих планах: `pnpm exec prisma migrate deploy|status|diff|validate`. Удаляются `@prisma/client` и `db:generate` (клиент нужен был только Nest и `seed.ts`), Nest/express/axios/cheerio/redis/class-*/rxjs/dotenv/tsx/typescript/@types/node и все `pnpm.overrides`; `pnpm-lock.yaml` перегенерируется. В `backend/.env.example` остаются только `DATABASE_URL` и `DIRECT_URL`.
3. `scripts/ci/run-checks.mjs` группа `nest`: `pnpm install --frozen-lockfile` + `pnpm exec prisma validate` с фиктивными loopback `DATABASE_URL`/`DIRECT_URL` (`postgres://ci@127.0.0.1:1/none`), без `pnpm audit` (prod-зависимостей не остаётся). Имя группы и имя джобы `Nest Reference` не меняются.
4. `scripts/ci/run-ephemeral-staging.mjs`: убрать сборку и запуск Nest, второй прогон parity с живым эталоном и `contracts test:live` по `:13000`; parity идёт только в replay-режиме, `contracts test:live` — только по Go.
5. Ручные parity-режимы на клоне продовых данных (запись к ним неприменима — данные не фикстурные): у `smoke` удаляется параметр `parity` и ветка сравнения с эталоном, Go-проверки остаются. Далее:
   - `TestLocalCloneParity` удаляется — без эталона он совпадает с `TestProductionClone`;
   - `TestLiveReadOnlyParity` переименовывается в `TestLiveReadOnlySmoke`, требование `REFERENCE_API_BASE_URL` убирается, `LIVE_READONLY_CONFIRM=1` остаётся;
   - `TestOperatorCloneParity` переименовывается в `TestOperatorCloneRuntime`, требование `REFERENCE_API_BASE_URL` убирается, проверки прав БД остаются;
   - `TestLiveVoiceParity` (voice на живых данных против эталона) удаляется — живого эталона больше нет, а Go-only live voice покрывают `voice_live_test.go`.
   Эти имена вызываются только из старых отчётов в `docs/`, скриптов с ними нет.
6. Документация: `README.md` (бейдж NestJS, стек, раздел «База данных» — локальная БД через `backend-go/scripts/local-ingest-db.sh`, миграции через `pnpm exec prisma migrate deploy` в `backend/`), `backend-go/README.md` (reference = запись, процедура обновления), `frontend/README.md`, `scripts/ci/README.md`, `docs/production/STAGING_PLAN.md`. Комментарии в `frontend/src/api/httpAdapter.ts` и его тесте: «NestJS» → «API v1» (формат ошибок тот же, его отдаёт Go). Комментарий в `pipeline/src/agent/gemini.ts` о `backend/src/voice` поправить на Go-реализацию. Отчёты в `docs/**/reports` и старые планы не трогаются.
7. `.github/dependabot.yml`: запись для `/backend` остаётся (там Prisma).

### Защищённые пути деплоя

`auto-transport.mjs` сравнивает активный релиз (сейчас e50de25) и кандидат по `backend/prisma`, `contracts`, `deploy/compose.production.yml` и пропускает только перечисленные исключения. Между e50de25 и `main` уже есть непокрытые изменения (две миграции 2026-11-07 и `schema.prisma`), поэтому следующему автоматическому rollout'у в любом случае нужно новое исключение для e50de25. Шаг 1 добавляет к этому набору ровно одно: удаление `backend/prisma/seed.ts` (blob → null). `contracts/` в шаге 1 не меняется вовсе, включая устаревшие формулировки про NestJS в `contracts/README.md` и `openapi.yaml` — их правка откладывается до релиза, который и так будет менять контракт. Список путей для будущего исключения указывается в описании PR.

### Не меняется в шаге 1

`backend/prisma/**` (схема, миграции, security SQL), `scripts/ci/postgres.mjs` (migrate deploy и цепочка), `check-source.mjs`, `auto-transport.mjs`, `auto-gate.mjs`, `ci.yml`, локальный CI, Go-код вне `tests/`, продовый образ. Деплой после merge не нужен; VPS-checkout обновляется обычным порядком при следующем обновлении sync.

## 5. Шаг 2 — отдельный PR после merge шага 1

1. `ci.yml`: джоба `nest` → `schema`, имя `Nest Reference` → `DB Schema`; `needs` у `postgres` и `gate` обновить. Число джоб остаётся 9, в CI Gate проверка `length!==8` не меняется.
2. `scripts/ci/run-checks.mjs`: группа `nest` → `schema`.
3. `scripts/deploy/auto-gate.mjs`: в `mandatory` `Nest Reference` → `DB Schema`; `auto-gate.test.mjs` обновить. `jobs.length === 9` не меняется.
4. `docs/production/GITHUB_BRANCH_PROTECTION.md`: список джоб.
5. Локальный CI вне репозитория (`C:\Development\AdilBaga-local-ci\run-local.mjs`): `known` и `expected` — `nest` → `schema`.

Последствие: `verifyCI` для CI-прогонов SHA до шага 2 перестаёт проходить (в них джоба называется `Nest Reference`), значит режим `build` в `deploy-production.yml` для таких SHA не работает. Откат продакшена делается переключением на уже имеющийся на VPS образ (на 2026-11-08 их 8, включая 49f6823 и b4f4b88), пересборка старых SHA не нужна. `AUTO_DEPLOY_ENABLED` сейчас `false`, автодеплой это не затрагивает.

## 6. Проверка

- Перед каждым push — локальный CI (`node C:/Development/AdilBaga-local-ci/run-local.mjs`), все группы.
- Шаг 1, push 1: hosted CI 9/9, в Ephemeral Staging оба прогона parity (живой Nest и replay) PASS.
- Шаг 1, push 2: hosted CI 9/9; в логе Staging нет запуска Nest; parity-тесты не `SKIP`, а `PASS` (проверка по `-v` выводу); `git grep -n -i nestjs -- ':!docs' ':!contracts'` пуст (в том числе README, комментарии и имена тестов во фронтенде).
- Негативная проверка replay (локально, не в CI): ручная правка одного ответа в записи даёт падение соответствующего parity-теста; удалённый обмен даёт «missing», лишний — «stale».
- Шаг 2: hosted CI 9/9 с джобой `DB Schema`; `node --test scripts/deploy/auto-gate.test.mjs` PASS; `node scripts/deploy/verify-auto-deploy.mjs` PASS.

## 7. Риски

| Риск | Что делаем |
|---|---|
| Ответ эталона недетерминирован (таймстемп, порядок) | Ловится двойной записью до коммита и двойным прогоном в push 1; нормализация конкретного поля |
| Запись разойдётся с тестом при будущих правках | Строгий replay: missing и stale entry падают |
| Кто-то правит запись, не понимая, что меняет wire-контракт | Процедура в `backend-go/README.md`; запись лежит рядом с тестами и видна в diff |
| Потеря `db:seed` для локальной БД | Локальная БД — через `local-ingest-db.sh` и фикстуры Go, описано в README |
| Сборка старых SHA после шага 2 | Откат через образы на VPS (раздел 5) |

## 8. Вне рамок

- Замена Prisma другим инструментом миграций (`_prisma_migrations` в проде остаётся).
- Перенос `backend/prisma` в другую папку.
- Изменения Go API, фронтенда (кроме комментариев), pipeline-логики, VPS.
