# Go API: cancellation classification fix

Дата: 2026-11-17. Source-only; production не изменяется.

## Причина и scope

Baseline origin/main: `a04bee643470753fd0874bc1b53d740a4593e618`. Worktree `/home/denis/tmp/aktau-go-request-cancellation`, ветка `fix/go-request-cancellation`. Owner checkout и незакоммиченная миграция Frontend сохранены.

Изучены AGENTS/RTK и отчёты в соседнем migration worktree:
`FRONTEND_API500_ROOT_CAUSE_AUDIT_2026-11-17.md`, `FRONTEND_VERCEL_TO_VPS_MIGRATION_2026-11-17.md` (§11). Причина пяти production500 остаётся **PROBABLE**. Этот fix не превращает её в CONFIRMED и не утверждает, что production уже исправлена.

Подтверждённый source defect: catalog responder переводил любую ошибку кроме not-found/invalid-query в500. Repository сохраняет context.Canceled/DeadlineExceeded. Timeout middleware не исправляет уже записанный500; AccessLog выводит internal_error только по status. Fail-first на исходном respond показал500 вместо отсутствия записи для canceled/wrapped canceled,500 вместо503 для live deadline.

## Изменённые файлы

| Файл | Изменение |
|---|---|
| backend-go/internal/httpapi/catalog.go | Request-aware wrapper для существующих catalog GET handlers, business error handling сохранён |
| backend-go/internal/middleware/cancellation.go | Узкая classification, request-local outcome, проверка errors.Is и context, защита joined independent error |
| backend-go/internal/middleware/http.go | AccessLog/Timeout используют общий outcome; no-write cancellation не превращается в200/503 |
| backend-go/internal/observability/metrics.go | Closed-set cancellation class и три outcome series; прежние HTTP status classes сохранены |
| backend-go/internal/httpapi/cancellation_test.go | Unit, logging/metrics, real TCP disconnect, connected-client deadline, panic/marshal/written-header preservation |
| backend-go/internal/postgres/cancellation_integration_test.go | Реальная отмена выполняющегося PG query и реальная PostgreSQL22012 error |
| scripts/ci/run-db-integration.mjs | Новый PG test включён в существующий mandatory guarded PG17 runner |
| Этот report | Review evidence, impact и release boundaries |

Repository implementation не менялась. Frontend, DB migrations/schema, dependencies, public DTO, timers, publisher, Cloudflare, production Docker не менялись.

## Новая семантика

| Ситуация | Поведение |
|---|---|
| success | Прежний200 |
| errors.Is(err,Canceled) + request ctx Canceled | Не писать error response; внутренний status0/error_code=request_canceled |
| wrapped Canceled | То же |
| err Canceled, request context active |500/internal_error, cancellation не доказана |
| чистый dependency DeadlineExceeded, клиент подключён |503 с прежним error envelope; error_code=request_deadline |
| real DB error, active или одновременно canceled request |500/internal_error |
| errors.Join(Canceled, independent error), включая wrapper |500; независимая причина не подавляется |
| panic / marshal error | Прежний500, без secret payload |
| headers уже записаны | Существующий response status не переписывается |

Cancellation классифицируется только по **двум** свидетельствам: первичная ошибка cancellation и отменённый request context. Multi-error tree должен целиком состоять из matching context errors; иначе500. Нельзя делать shortcut только по ctx.Err().

Request outcome хранится в одном request-local atomic значении; это не глобальное хранилище/новый сервис. Его видят AccessLog и Timeout, поэтому intentional no-write не получает fallback200 или503. При committed response его статус имеет приоритет. Сам transport при возврате handler может выполнять стандартную финализацию; fix не утверждает доставку какого-либо ответа отключённому клиенту.

Status0 — **внутренний sentinel «не пытались писать ответ»**, не публичный HTTP status и не499. Существующие log fields, request_id и route templates сохранены. Добавлены только закрытые error_code: request_canceled/request_deadline (internal_error сохраняется). Нет raw error, query, SQL, env, токенов, IP/координат.

Метрики: cancellation идёт в `http|<bounded-route>|<bounded-method>|canceled`, Count растёт, Failures не растёт; не в2xx и не5xx. Deadline503 остаётся5xx. Дополнительные bounded series `http_outcome|request_canceled`, `http_outcome|request_deadline`, `http_outcome|internal_error`. Unknown inputs не создают произвольные labels. Публичного exporter/endpoint нет.

Предшествующая postgres mapping SQLSTATE57014→DeadlineExceeded оставлена без изменения; она не доказывает конкретный источник cancellation. Исторические пять событий не получили новой атрибуции задним числом.

## Тесты и команды

Native WSL; Node24.10.0, pnpm10.32.1, Go1.27.4 (project versions, без dependency upgrade). Evidence вне Git: `/home/denis/tmp/aktau-cancellation-fix-evidence`.

1. Первый scaffold вызвал отсутствующий respondRequest: compiler FAIL (не считается поведенческим доказательством). Затем test направлен на исходный respond; `go test ./internal/httpapi -run TestRequestErrorClassification -count=1`: **exit1**, три expected behavior failures. `fail-first-behavior.log` сохранён, assertions не ослаблялись.
2. `go test ./internal/httpapi ./internal/middleware ./internal/observability`: exit0 после implementation; expanded suite exit0.
3. `go test -race ./internal/httpapi -run 'TestRequestErrorClassification|TestClientDisconnect|TestDeadlineWithConnectedClient|TestPreserveServerFailures' -count=1 -v`: exit0. Twelve error-classification cases + actual TCP disconnect + live-client503 + panic/marshal/prewritten status202.
4. `node scripts/ci/run-db-integration.mjs`: **exit0**. Existing disposable PG17 fixture/security/Voice/HTTP/retention/rollback suites выполнены; PG cleanup PASS. New `TestLocalCanceledQuery` PASS, без SKIP: guarded loopback reader, pg_sleep10 наблюдается реально active/PgSleep через pg_stat_activity перед cancel, errors.Is canceled подтверждён. SELECT1/0 реально дал PgError22012, databaseError не подменил его cancellation. Никаких production DB accesses.
5. `CI_BASE_SHA=a04bee643470753fd0874bc1b53d740a4593e618 node scripts/ci/run-checks.mjs security`: **exit0**, source/workflow policy и synthetic backup guard PASS.
6. `node scripts/ci/run-checks.mjs go`: initial FAIL на staticcheck SA4006/SA4017 (лишний initial ErrorCode assignment), исправлен на declaration, полный повтор обязателен. Финальный полный повтор: **exit0 PASS**, включая unit/race/vet, staticcheck обычный/integration, govulncheck (no vulnerabilities) и api/ingest/prune builds. Исходный FAIL сохранён отдельно.
7. `git diff --check`: exit0.

Команды используют rtk proxy; PATH включает `/home/denis/.nvm/versions/node/v24.10.0/bin` и установленный Go1.27.4 toolchain bin, так как CI runner задаёт GOTOOLCHAIN=local. Версии проекта не менялись.

Полный Go runner включает gofmt, mod tidy/drift/verify, unit, race, vet, staticcheck обычный/integration, govulncheck, api/ingest builds. Integration runner выполняет настоящие локальные HTTP/PG security parity проверки, не просто vet integration files.

## Integration impact и ограничения

Frontend не требует изменений API/DTO. Backend2 продолжает штатные sync/наблюдение без ручных новых actions; consumers access logs должны учитывать внутренний status0/request_canceled вместо ошибочного500. Dashboards, считающие только status2xx/5xx, должны показывать canceled отдельно, не как success. Новая503 — existing Service Unavailable envelope и существующий middleware status; no public499.

Fix охватывает request-aware catalog reads (categories/filters/products/product/dashboard). Voice и SZPT error-response logic в этой задаче не переписывается; общий middleware сохраняет их прежние ответы. Это не универсальная переработка всех request cancellation в приложении.

Локальная проверка не является независимым Code Review. Нельзя применять в production до внешнего review, exact-main CI/artifact и отдельного release разрешения. В этом TASK нет SSH, rollout, реального HMAC, ingest или DB mutation. Нет утверждения о natural production PASS.

## Draft PR / CI qualification

Ветка предназначена для Draft PR в kiratonine/AdilBaga: main ← fix/go-request-cancellation. Hosted exact-head CI должен быть проверен после push; фактические SHA/run/jobs сообщаются вместе с review artifact и итогом исполнения. До получения реальных результатов hosted CI не считается PASS. Финальная CI qualification добавляется локально в этот report после завершения (documentation-only annotation, исходный reviewed source hash фиксируется отдельно).

## Рекомендация

Кандидат пригоден только для независимого Code Review после PASS обязательных checks. Production deployment в рамках этой задачи запрещён. Внешнему reviewer проверить sentinel0, joined errors, deadline policy и совместимость log consumers; исторический incident остаётся PROBABLE_CAUSE_NEEDS_VALIDATION.
