# SHYMKENT-01 — синхронизация базы и изоляция релиза

**Статус локального пакета — READY_FOR_REVIEW.** Точная проверка PR HEAD, ссылки и выводы GitHub Actions вынесены во внешний `CI_EVIDENCE.md` из пакета проверки.

Тематическая ветка `chore/shymkent-safe-baseline-sync` сохраняет пять исходных коммитов Актау с исправлениями PostgreSQL argv, readiness и UID/GID. В Шымкенте релизные задания остаются недоступны. Ветка подготовлена для независимого review через PR. Merge и активация production относятся к отдельным этапам.

## Checkout, фиксация базы и импорт

| Проверка | Результат |
| --- | --- |
| Исходный checkout | WSL2, `/mnt/d/install/projects/ShymkentMarket`, пользователь `denis`. `main` оставлен на начальном SHA. |
| Изолированный worktree | `/home/denis/shymkent-stage01.Cdtu3I1D/checkout`, нативная файловая система WSL. |
| Fetch и push URL origin | Оба `https://github.com/denisthe12/shymkentmarket.git`. Дополнительных URL, перенаправлений Git или активных push hooks не обнаружено. |
| Fetch Shymkent `main` | `33d662707b133440de9003d687e3b921e78414ed`, 2026-11-19 01:28:52 +05:00. |
| Read-only fetch Aktau `main` | `52e58ecb6463c897055f7f6f72ada086dee5a723`, 2026-11-19 01:28:54 +05:00. |
| Граф | Оба объекта — commit. `git merge-base` вернул SHA Shymkent. `git merge-base --is-ancestor` exit 0. `git rev-list --left-right --count` вернул `0 5`. |
| FF | `git merge --ff-only 52e58ecb6463c897055f7f6f72ada086dee5a723` в worktree тематической ветки. Импортированный HEAD совпал с закреплённым коммитом. Оба tree ID — `d468fd1ee45711edd952c6a1596ad0ccf506116b`. `git diff --exit-code <Aktau SHA> HEAD` exit 0 до адаптаций. |

Свежие SHA совпали с исторической точкой задания. Диапазон содержит следующие коммиты.

- `377711a32be17dcec2c7502bda0d6370397550a5` — PostgreSQL argv, ограничение readiness и регрессии.
- `3c5e8cbc9f2c984808a158f243949e49b2a73cd5` — merge PR #141.
- `3a463358c846f1e6897450edf1bf0dd3450baa12` — Git status под UID/GID sync.
- `c6700f750049de4d3ed63381f901b89a5566e6bf` — раздельные дедлайны подтестов дочерних процессов.
- `52e58ecb6463c897055f7f6f72ada086dee5a723` — merge PR #142.

`TODO/SHYMKENT_AGENTS_PROPOSED.md` отсутствовал. В качестве точного эквивалента использован действующий проектный `AGENTS.md`, предоставленный Owner в задаче и уже лежавший под игнором в исходном checkout. Файл скопирован побайтно и добавлен по явному пути. SHA256 `d67fb6b6838c0604efaf98312d2698b6b0d53a09def1ae6207021c6f01e48d63`. Проверены корневые правила и единственный вложенный `frontend/AGENTS.md`. Исходные `AGENTS.md` и `TODO/SHYMKENT_01_SAFE_BASELINE_SYNC.md` сохранили SHA256. Отдельные PROJECT_CONTEXT и AI_WORKFLOW в checkout не найдены.

## Изоляция GitHub Actions и production

В базовом, импортированном и подготовленном деревьях одинаковые файлы обоих workflows. В инвентаре отсутствуют локальные composite actions, reusable workflows, `pull_request_target`, release, schedule и tag paths. Отдельный `dependabot.yml` содержит недельное расписание проверок зависимостей с лимитом version-update PR 0. Это путь проверки зависимостей, без ссылок на инфраструктуру рынков.

| Событие и job | Операция | Достижимость в Shymkent |
| --- | --- | --- |
| CI `pull_request` на `main` / `integrate/full-stack`, `push` на эти ветки, `workflow_dispatch` | `contracts`, `go`, `schema`, `frontend`, `pipeline`, `security`. Frozen installs, проверки исходников и схемы, сборка и синтетические тесты. | Доступны. GitHub-hosted Ubuntu 24.04, token `contents: read`, checkout с `persist-credentials: false`, версии actions закреплены SHA. Production Environment, выражений `vars.*` и `secrets.*` в CI нет. Push именно этой topic-ветки не подходит под CI branch filter. |
| CI `postgres` после Go/Schema/Contracts/Security, `staging` после Postgres/Frontend | Изолированные PostgreSQL 17, локальные API/Next и Docker, фикстуры. | Доступны. `scripts/ci/common.mjs` не переносит внешние DB/provider/backup-переменные. `postgres.mjs` создаёт новый контейнер без пользовательского DSN, использует loopback, операции идут по принадлежащим прогону именам. `run-ephemeral-staging.mjs` использует синтетический PG, тестовые сервисы и локальный reference corpus. |
| CI `gate`, `always()` | Требует успешного завершения восьми предшественников. | Доступен. Вычисляет только статусы jobs. |
| Deploy `workflow_run` (CI completed, branch main) и `workflow_dispatch` | `offline` читает `main`, запускает тесты брокера/транспорта и статические верификаторы. | Доступен. Без environment, production credentials, внешних вызовов скриптов доставки. Тесты SSH/Git используют программные подмены. |
| Deploy `gate` с зависимостью `offline` | `auto-build.mjs gate` → `auto-gate.mjs` → проверка exact-main CI и GitHub artifact provenance. | Заблокирован первым условием `github.repository == 'kiratonine/AdilBaga'`. Это условие обязательно и при `AUTO_DEPLOY_ENABLED=true`. |
| Deploy `build_only` | `auto-build.mjs build`, Docker build/save и загрузка неизменяемого артефакта в GitHub. | Заблокирован. Требует успешного `gate` и `needs.gate.outputs.eligible == 'true'`. |
| Deploy `rollout` | Production Environment, immutable artifact checks, `auto-transport.mjs` → SSH → broker, затем rollout. | Заблокирован. Требует того же `gate` и `eligible`; ещё требуются activation и manual deploy. Хост, пользователь, порт, SSH key и known_hosts используются только на недоступном пути. |
| Deploy `plan_only` | Production Environment, проверка артефакта, диагностический SSH plan без submit. | Заблокирован собственным условием идентичности Актау даже при выключенной переменной активации. |

Дополнительные пути проверены по точкам запуска. `auto-gate.mjs` сверяет repository у входного события, CI и head repository до допуска. `auto-build.mjs` валидирует SHA/run/attempt и producer. `auto-transport.mjs` использует API provenance и SSH с проверкой known_hosts. В CI этих скриптов запускаются только тестовые входы и статические проверки. Frontend VPS/invalidation, Cloudflare, sync, мониторинг и backup/restore находятся в операторских скриптах и runbooks без job-входов. Тесты HMAC, Git/SSH, брокера, уведомлений и источников используют подмены или loopback. Публичные служебные зависимости для сборки включают package/image registries, базы advisories, Chromium и шрифты. Данные площадок, API рынков и реальные аккаунты при проверках не требуются.

До публикации GitHub API подтвердил идентичность репозитория и default branch, два активных workflow, Actions enabled, ноль self-hosted runners, отсутствие возвращённых записей environments, Actions variables и webhooks. Прочитано число записей repository Actions secrets, без значений. Branch protection API вернул `Branch not protected`; list effective rules пуст. Доступ к инвентарю установок Apps через проверенный repository endpoint — `UNVERIFIED` (404). Вывод об изоляции job основан на коде и не зависит от наличия credentials. Настройки и правила репозитория в рамках этапа не менялись.

| Классификация | Примеры |
| --- | --- |
| `READ_ONLY_REFERENCE` | Исторические отчёты, `deploy/README.md`, документы фронтенда/VPS, Актау release SHA и имена операторских ресурсов. |
| `DEPLOY_DORMANT` | `deploy/compose.production.yml`, релизные shell/Python/Node entry points, production Environment, образ и artifact pipeline, SSH, домены/tunnels, операторские DB роли, sync, HMAC invalidation и мониторинг. |
| `TEST_FIXTURE` | Docker/PG синтетические роли, payloads с DNS/SSH/REST placeholders, reference JSON и тестовые снимки, отключённые аналитические интеграции, подмена тайлов карты. |
| `CI_ONLY` | Публичные зависимости сборки, read-only checkout, loopback E2E, одноразовые контейнеры, браузерный build и CI Gate. |
| `POTENTIALLY_ACTIVE` → исправлено | Тесты карты могли обратиться к публичному сервису тайлов. В трёх браузерных путях установлена локальная SVG-подмена. Runtime карты прежний. Staging использовал фиксированный Docker-тег, уже занятый локально. Тег теперь привязан к имени одноразового PG-прогона и удаляется при cleanup. |

Статическая проверка PyYAML прочитала структуры обоих YAML, сверила их байты с обоими базовыми SHA, набор событий, jobs и зависимостей, права, версии actions, флаг checkout и допустимые команды offline. Синтетическая проверка `gateCandidate` отвергла 8 сочетаний `workflow_run`/manual × build/deploy/plan/dry-run даже с включённой активацией. `git diff --check` и ограниченный scanner проекта прошли. Паттерны credential-like строк в добавленных файлах относятся к синтетическим тестам. Триггеры deployment вручную не вызывались.

## Проверка исправлений

| Команда | Результат |
| --- | --- |
| `node --test ops/postgres/psql-run.test.mjs` | PASS (0), 2 теста. Заглушка `psql` получила только фиксированные флаги и имя SQL файла. Проверены байты CSV stdin, разделение reader/owner, исключение PG overrides и отсутствие пароля в диагностике. |
| `python3 -m unittest discover -s ops/status -p 'adilbaga_status_test.py' -v` | PASS (0), 18 тестов; SKIP (1) для root fixture в непривилегированном прогоне. Проверены UID/GID options, safe warning, отказ от повторного запуска и лимиты stdout/таймаута. |
| Тот же status unittest в Docker Ubuntu 24.04, `--network none`, read-only source mount, отдельный `/tmp`, fixture flag | PASS (0), 19 тестов; измерены реальные/effective UID/GID, группы и неизменность fixture Git index. |
| `cd backend-go && go test ./internal/httpapi` | PASS (0). Burst из 128 запросов, один Ping, cache/outage/recovery и отмена. Go Quality повторно проверяет пакет с race detector. |
| `cd backend-go && go test -count=1 ./internal/postgres` и сравнение исполняемых строк трёх изменённых SQL файлов с базой | PASS (0). Golden generation SQL сохранена, в самих SQL изменены только комментарии. |
| `node --test scripts/deploy/auto-gate.test.mjs` | PASS (0), 107. |
| `python3 -m unittest discover -s scripts/deploy -p 'auto_*_test.py'` | PASS (0), 57. |
| `node scripts/deploy/verify-auto-deploy.mjs`, `node --test scripts/deploy/verify-part15.test.mjs`, `node scripts/deploy/verify-part15.mjs` | PASS (0) для каждой команды, offline. |

## Полные локальные проверки

Node 24.10.0, pnpm 10.32.1, Go 1.27.4, Python 3.12.3, Docker 29.1.3 на локальном Unix socket. CI запущен из native WSL worktree с очищенным окружением и `CI_BASE_SHA`, закреплённым на Shymkent main. Проверки выполнялись без записи production reference corpus.

| Команда | Результат |
| --- | --- |
| `node scripts/ci/run-checks.mjs contracts` | PASS (0). 16 статических проверок, 11 HTTP cases SKIP в статической группе. Live-contract режим запускается только против временного Go API в staging. |
| `node scripts/ci/run-checks.mjs go` | PASS (0). Формат, модульный drift, unit/race, vet, staticcheck, govulncheck, три сборки. |
| `node scripts/ci/run-checks.mjs schema` | PASS (0), Prisma 5.22 validate. |
| `node scripts/ci/run-checks.mjs frontend` | PASS (0). 364 unit, 83 E2E, 11 штатных E2E SKIP (desktop/mobile или отдельный профиль). Повтор после фикса тайлов. |
| `node scripts/ci/run-checks.mjs pipeline` | PASS (0), unit/typecheck. |
| `node scripts/ci/run-checks.mjs security` | PASS (0), source policy, immutable migration base, backup/argv, disposable guards, broker/status. |
| `node scripts/ci/run-checks.mjs ops` | PASS (0), 227 тестов, включая локальный TLS lifecycle. |
| `node scripts/ci/run-db-integration.mjs` | PASS (0), два собственных PostgreSQL 17. Миграции, guards, транзакционность, роли, rollback и cleanup. |
| `node scripts/ci/run-ephemeral-staging.mjs` | PASS (0). Readiness burst и catalog/dashboard, frozen HTTP parity, local GET contract, HTTP E2E (14 PASS, 6 штатных SKIP), Docker UID 10001/read-only, outage 503 и восстановление без рестарта. 4 fixture-Voice HTTP cases SKIP в GET profile. |
| GitHub CI Gate | Результат и ссылка на точный PR HEAD во внешнем `CI_EVIDENCE.md`. |
| Ручные production, Voice/Siri, выкладка, production RLS/explain и импорт | NOT_RUN, вне этапа. |

Для локальных DB/staging прогонов перед передачей управления тестам независимая обёртка Docker принимала только ожидаемый `run` для новой PG17, проверяла новый ID, CI label, отсутствие bind mounts и loopback binding. Read-only запрос подтвердил `postgres` как базу/роль и тот же system identifier по TCP внутри контейнера и через опубликованный loopback; только после этого скрипт допускался к bootstrap. Артефакты контейнерных прогонов принадлежат этому запуску. Существовавший фиксированный Docker-тег проверен отдельно.

История ретестов.

- Root-фикстура получила FAIL (1) при запуске вспомогательного файла из Docker tmpfs с дефолтным запретом исполнения. Повтор с `exec` только на временном tmpfs и сетевой изоляцией дал 19 PASS. Код и таймауты не менялись.
- Первый локальный DB запуск дал FAIL (1) в независимой проверке цели, до bootstrap: обёртка поместила опцию порта между `-h` и значением. Порядок исправлен, новый контейнер повторно проверен, полный DB suite PASS. Уровень проверок сохранён.
- Первый Frontend PASS был до фикса тайлов. Фактические сетевые запросы того прогона не записывались, поэтому отсутствие обращений к публичному tile service для первого прогона не подтверждено. Итоговые тесты используют подмену, требующую успешно загруженный плиточный элемент в тесте карты.

## Инвентарь путей и передача на review

**Импорт** — 19 путей.

```text
A	backend-go/internal/httpapi/readiness.go
A	backend-go/internal/httpapi/readiness_test.go
M	backend-go/internal/httpapi/server.go
M	backend-go/internal/postgres/szpt_explain_test.go
A	docs/production/reports/SECURITY_FINDINGS_02_03_REMEDIATION_REPORT.md
A	docs/production/reports/SECURITY_FINDING_01_PRIVILEGE_BOUNDARY_FIX_REPORT.md
M	docs/superpowers/plans/2026-11-14-szpt-weighted.md
M	ops/postgres/README.md
M	ops/postgres/import-price-history.sql
A	ops/postgres/psql-run.mjs
A	ops/postgres/psql-run.test.mjs
M	ops/postgres/szpt/offer_price_basis_check.sql
M	ops/postgres/szpt/szpt_members_explain.sql
M	ops/status/README.md
M	ops/status/adilbaga_status.py
M	ops/status/adilbaga_status_test.py
M	ops/sync/README.md
M	scripts/ci/run-checks.mjs
M	scripts/ci/run-ephemeral-staging.mjs
```

**Адаптации Shymkent** — `AGENTS.md`, дополнение cleanup в импортированном `scripts/ci/run-ephemeral-staging.mjs`, `frontend/e2e/map-tiles.ts`, `frontend/e2e/{pages,http,shell}.spec.ts`.

**Отчёт** — `docs/production/reports/SHYMKENT_01_SAFE_BASELINE_SYNC_REPORT.md`. Пакет содержит committed bytes по allowlist, манифест размеров, режимов и SHA256, список изменений/удалений и внешний CI addendum.

Публичный API contract, миграции и SQL statements сохранились. Исторические домены, пути и имена Актау остаются входом для следующего инвентаря. Отдельные production approvals, настройка branch protection, выбор источников и локализация не входят в этот этап. Для отката достаточно прекратить использование ветки или провести отдельный review revert; исходный SHA Shymkent зафиксирован, production state и `main` не изменялись. Точка остановки — независимое review пакета до merge и production.
