# SHYMKENT-03 — готовность общего репозитория

**READY_FOR_REVIEW** для согласованного scope. Репозиторий на кандидате соответствует техническим условиям **TEAM_DEV_READY**. У трёх участников есть общий путь запуска, серверная защита `main` подтверждена. Документационный PR передаётся на независимое review. Задачи Jira и индивидуальные инструкции не создавались.

## Baseline, доступ и границы

- WSL2. Корневой checkout физически находится в `/mnt/d/install/projects/ShymkentMarket`. Отдельно проверены fetch и effective push URL. Оба — `https://github.com/denisthe12/shymkentmarket.git`. Отдельной настройки `remote.origin.pushurl`, URL rewrites, push overrides и действующих local hooks не обнаружено. Изначальные игнорируемые `AGENTS.md` и `TODO/` сохранены. У ранее созданных worktree отсутствовали tracked изменения. Ветка `feature/shymkent-blog` не использовалась.
- Fresh `git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main` закрепил `1fc7ff64335736184a571d7c08f91e6679d4eaf6` (tree `0685922e9f326669f13b15b8707acbe6b76631fc`). PR №1 и №2 merged, merge SHA PR №2 — тот же SHA, ancestry exit 0, новых коммитов до создания ветки нет. Точное post-merge CI подтвердило 9/9. [PR №1](https://github.com/denisthe12/shymkentmarket/pull/1) · [PR №2](https://github.com/denisthe12/shymkentmarket/pull/2) · [Baseline CI](https://github.com/denisthe12/shymkentmarket/actions/runs/44411542572)
- Единственный task worktree `/home/denis/tmp/shymkent-market-team-readiness` и ветка `chore/shymkent-team-repository-readiness` созданы от закреплённого `origin/main`. При создании `git status --porcelain` и список ignored файлов были пусты. Кандидатный commit, tree, имя PR и job IDs указываются во внешнем `ci-evidence.md`, чтобы отчёт мог оставаться в проверенном commit.
- Public read-only clone с отключённым credential prompt успешно получил тот же `main`. GitHub API для direct collaborators вернул одного администратора и двух участников с ролью `write`. Pending invitations — 0. Токены и настройки коллег не проверялись. Доступ указан в агрегате, без персональных данных.

## GitHub protection

**CONFIGURED**, read-only проверка 2026-11-19. API `branches/main` вернул `protected: true`. Эффективные правила `rules/branches/main` относятся к ruleset №27592978, enforcement `active`, default branch, bypass actors отсутствуют. Набор: PR (merge commit only), strict required `CI Gate` от GitHub Actions (integration 15368), запрет deletion и non-fast-forward. GitHub approving review count = 0. Независимый `APPROVED` и отдельное Owner разрешение остаются правилами команды. Legacy protection endpoint вернул HTTP 404 о classic protection. Этот результат не отменяет активный ruleset. API прочитан без изменений настроек. [Ruleset](https://github.com/denisthe12/shymkentmarket/rules/27592978)

## Общий onboarding и границы наследия

- Команды используют свой `$HOME`, один worktree/branch/PR на задачу и повторное использование при review fix. Owner-пути оставлены как пример и правило для его Codex-сессии. Corepack устанавливает shim в пользовательский каталог, а версии совпадают с CI во всех пакетах, включая frontend без собственного поля `packageManager`.
- Поиск legacy markers в tracked tree подтвердил наследие в ролях, фикстурах, путях, исторических отчётах и OpenAPI. Они остаются совместимыми. Рабочие ссылки в корневом README и onboarding ведут к Shymkent. Исторические ссылки и факты прежнего проекта сохранены. [Карта документации](../../README.md) и [общий onboarding](../../developer-onboarding.md).
- В пяти унаследованных README вставлена только Markdown-шапка. Тексты под заголовками у `frontend/README.md`, `ops/{cloudflare,frontend,postgres,sync}/README.md` побайтно сохранены. Шапки направляют к общему onboarding и объясняют, что приведённые хосты, роли и конфигурации относятся к Актау. Старые пользовательские маршруты, статьи, бренд, даты и эксплуатационные тексты не переписывались.
- Остаточные смежные действия относятся к отдельным задачам. Frontend владеет `frontend/src/`, городскими метаданными, контентом, SEO и UI. Backend 2 владеет `backend/prisma/`, `pipeline/` и процедурами `ops/sync/`. Owner утверждает Shymkent ресурсы и настройку будущего релиза. Сейчас это **не блокеры** для старта с фикстурами.

## Dev readiness

Тестовый запуск выполнен из свежего native WSL worktree. До первого теста проект не содержал локальных зависимостей и `.env`. Дополнительный read-only clone в scratch был bare, без второго worktree. Для команд использовались пустой HOME, короткий PATH с Node 24.10.0 / Corepack 0.34.0 / Go 1.27.4 и восстановленный из публичных пакетов pnpm 10.32.1. Ни пользовательское npm/Git окружение, ни credentials, ни конфиги проекта не копировались. Git clone выполнен с `GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0`. Проектные пакеты, Go module cache и браузер загружались заново.

| Requirement | Результат | Evidence |
| --- | --- | --- |
| Клон, права и worktree | PASS | Bare clone и чистое рабочее дерево на точном baseline. Обе ссылки origin проверены. Read-only metadata подтверждает три роли с правом работы. |
| Toolchain и lockfiles | PASS | `corepack enable --install-directory "$HOME/.local/bin" pnpm`, `corepack install --global pnpm@10.32.1`, `pnpm --version` в четырёх пакетах. Frozen installs совершены через CI runner. |
| `node scripts/ci/run-checks.mjs contracts` | PASS | Exit 0, 16 PASS и 11 штатных SKIP без HTTP base. |
| `node scripts/ci/run-checks.mjs go` | PASS | Exit 0, Go fmt/mod, unit и race, vet, staticcheck, govulncheck, сборки. Нет drift go.mod/go.sum. |
| `node scripts/ci/run-checks.mjs schema` | PASS | Exit 0, Prisma validate с loopback placeholders. |
| `node scripts/ci/run-checks.mjs frontend` | PASS | Exit 0, 364 unit tests, audit, build, Chromium, 83 E2E PASS и 11 штатных SKIP. |
| `node scripts/ci/run-checks.mjs pipeline` | PASS | Exit 0, unit fixtures и typecheck. Скраперы и ingest не вызывались. |
| `node scripts/ci/run-checks.mjs security` | PASS | Exit 0, guards и source-policy. Root-only fixture — штатный SKIP. |
| `node scripts/ci/run-checks.mjs ops` | PASS | Exit 0, 227 синтетических тестов. |
| Mock UI по onboarding | PASS | Exit 0. Выполнен shell-блок из onboarding. RU HTTP 200 (5149 ms), KK HTTP 200 (663 ms), HTML lang совпал. Собственный процесс завершён. |
| `node scripts/ci/run-db-integration.mjs` | PASS | Exit 0. Два новых PostgreSQL 17, миграции, транзакции, роль и rollback, cleanup PASS. |
| `node scripts/ci/run-ephemeral-staging.mjs` | PASS | Exit 0. Новый PostgreSQL 17, локальные parity/GET/Playwright, readiness burst, Docker read-only API, outage и recovery без рестарта. Очистка PG, API, network и image tag PASS. |
| Markdown и shell | PASS | Проверены относительные links/anchors и синтаксис активных shell-блоков. Два сохранённых шаблона Актау, не являющиеся готовыми shell-командами, исключены точечно после сравнения с базой. |
| Scope и локальные guards | PASS | `git diff --check`, scoped diff, bounded source/secret check, YAML guards. GitHub CI и манифест связаны с точным HEAD во внешнем evidence. |

Docker 29.1.3 подтверждён как локальный daemon WSL на Unix socket. До SQL bootstrap отдельная проверка подтверждала ID нового Docker container, CI label, отсутствие bind mounts, loopback port и совпадение identity PostgreSQL по TCP внутри контейнера и по назначенному loopback. Эффективная база и роль — `postgres` в одноразовом PG17. Унаследованные имена ролей и фикстур использованы только в новых test containers. Порты staging были свободны до запуска. Очистка применялась к ресурсам прогона.

### FAIL → FIX → RETEST

В исходном onboarding команды клонирования и worktree зависели от путей Owner. Новый flow проверен в свежем worktree с чистым HOME и закреплённым CLI. Hosted и локальные entrypoints остались теми же.

Первый `bash -n` вернул FAIL на двух неизменённых блоках `ops/sync/README.md` из-за заполнителей в угловых скобках. Блоки совпали с baseline. В шапке явно обозначены как исторические шаблоны. Повтор проверил все актуальные команды и пометил только эти два неизменённых блока SKIP. Shell-содержимое обоих не менялось и не выполнялось.

## Production readiness

| Requirement | Результат | Evidence |
| --- | --- | --- |
| Fail-closed Actions | PASS | Workflow inventory: CI и Deploy production Go API, без reusable workflow, self-hosted runners и webhook paths. CI read-only, на topic push `main`/legacy filter не совпадает, PR вызывает обычные проверки. `gate` и `plan_only` требуют identity Актау, `build_only` и `rollout` зависят от успешного `gate`. YAML и release scripts побайтно совпадают с baseline. |
| Релизные задания на принятом baseline | SKIP | После последнего merge выполнились только offline checks, четыре защищённых release jobs пропущены. [Baseline release workflow](https://github.com/denisthe12/shymkentmarket/actions/runs/44412313591) |
| Build/push релиза, production, скрапинг, import, SSH, реальные DB mutation и provider calls | NOT_RUN | Ни один реальный ресурс Актау или Шымкента не использовался. |
| Shymkent production, магазины и данные | NOT_RUN | Production `NOT_CONFIGURED`. Городские данные, adapters, UI/SEO и планы Jira остаются за рамками готовности общего репозитория. |

## Изменённые пути

```text
M	AGENTS.md
M	README.md
M	docs/README.md
M	docs/developer-onboarding.md
M	docs/production/GITHUB_BRANCH_PROTECTION.md
M	frontend/README.md
M	ops/cloudflare/README.md
M	ops/frontend/README.md
M	ops/postgres/README.md
M	ops/sync/README.md
M	scripts/ci/README.md
A	docs/production/reports/shymkent-market-team-readiness-report.md
```

После независимого review исправления идут в тот же worktree, ветку и PR. `MERGE = NOT_AUTHORIZED` без нового решения Owner. Настройки GitHub в этой задаче не менялись.
