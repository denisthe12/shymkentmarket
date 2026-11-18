# Shymkent Market — готовность документации к командной работе

**READY_FOR_REVIEW** для документации в разрешённой области. **BLOCKED_FOR_HANDOFF** для полной готовности инструкций Frontend и Backend 2: согласованные изменения их зоны остаются отдельной задачей. Production, настройка каталога и городская адаптация имеют собственные условия готовности.

## Принятый baseline

- Owner явно авторизовал штатный merge PR №1 по независимому review `APPROVED`. До merge GitHub подтверждал `CLEAN`, `MERGEABLE`, base `main` на `33d662707b133440de9003d687e3b921e78414ed` и HEAD `a46385c6aa7a0117acd1305ba42b88a99344dee0`. Все девять checks прошли на этом HEAD. [PR №1](https://github.com/denisthe12/shymkentmarket/pull/1) · [CI PR №1](https://github.com/denisthe12/shymkentmarket/actions/runs/44393191578)
- GitHub merge с `--match-head-commit` завершился `merged=true` в 2026-11-18 21:39:02 UTC. Merge SHA и проверенный `origin/main` — `c2046b42c36676bf17389b3cf606d3ea0dabfb06`. Одобренный HEAD входит в ancestry, exit 0. Tree `91932c067fa99031b579554365566da153ec256f` побайтно совпал с деревом одобренного HEAD.
- Post-merge push CI — **PASS 9/9**, включая CI Gate, на точном merge SHA. [CI после merge](https://github.com/denisthe12/shymkentmarket/actions/runs/44403660249)
- Обе версии workflow и вызываемые release-скрипты сравнили с предыдущим `main`. Два repository gate указывают на Актау. `build_only` и `rollout` зависят от `gate` и его признака eligibility. После merge автоматический workflow выполнил только offline checks. `gate`, `plan_only`, `rollout` и `build_only` получили **SKIP**, production job не запущен. [Run изоляции](https://github.com/denisthe12/shymkentmarket/actions/runs/44404522714)
- Корневой WSL checkout `/mnt/d/install/projects/ShymkentMarket` и существующий worktree SHYMKENT-01 проверены. Игнорируемые рабочие файлы и локальная `main` сохранены. Обе настройки origin ведут в `https://github.com/denisthe12/shymkentmarket.git`. Свежий fetch обновил remote-tracking ref. Чужая ветка `feature/shymkent-blog` не использовалась. До создания новой ветки она не имела одноимённого локального или удалённого ref.
- Ветка документации `docs/shymkent-repository-readiness` создана от проверенного `main` в единственном постоянном worktree `/home/denis/tmp/shymkent-market-repository-readiness`. Финальные PR URL, SHA и job IDs хранятся во внешнем `ci-evidence.md` в пакете review, чтобы добавить их без повторного изменения протестированного commit.

## Что изменилось

- README и карта документации теперь описывают Shymkent Market, технологическую архитектуру и разницу между текущим кодом, одноразовыми проверками и ещё не настроенными production, БД, источниками и данными. Кнопка Live App Актау и показатели чужого каталога убраны из актуального README.
- Onboarding описывает clone, WSL worktree, pinned toolchain, локальные проверки и RU/KK mock-профиль. AGENTS закрепляет одну папку, ветку и PR на задачу, повторное использование при review fix, владельцев зон и размещение архивов на верхнем уровне `/home/denis/tmp`. В tracked tree нет отдельного `02_SHYMKENT_MARKET_AI_WORKFLOW.md`. Для внешней версии применимы те же правила папки, ветки, PR и архива.
- Go README, contract tooling, CI, staging и СЗПТ описывают поведение кода и проверенную локальную среду. Операционные команды вынесены из актуального пути запуска. В частности, готовность API теперь описывает фактическое ограничение конкурентных Ping и дедлайн. OpenAPI bytes, examples и JSON reference corpus сохранены.
- Документы релиза, стека мониторинга, диагностики и старой квалификации помечены как справки Актау. В них сохранены тело, исторические факты и проверяемые статическими скриптами маркеры. Новый индекс runbooks ведёт к локальным диагностическим шагам и отделяет чужие VPS-примеры.

## Инвентарь baseline и кандидата

В предыдущем инвентаре исходным был `33d662707b13`. После merge заново просканированы все tracked текстовые blobs на `c2046b42c366` и staged документация. [Машиночитаемый инвентарь](shymkent-market-repository-readiness-inventory.tsv) содержит по каждому пути класс, количество до/после, совпадения в именах, диапазоны строк и решение. Маркеры включают названия города и бренда, известные домены/репозиторий, коды/домены магазинов, операторские пути и слова провайдеров. Счётчики пересекаются и не показывают доступность сервиса. Два новых файла evidence исключены из подсчёта, чтобы инвентарь не считал сам себя. Исходно 943 tracked объекта, 815 текстовых, 128 бинарных, симлинков 0. В review 817 текстовых объектов без двух файлов evidence.

| Класс | Пути | До | После |
| --- | ---: | ---: | ---: |
| `LIVING_DOC_EDIT` | 11 | 125 | 40 |
| `HISTORICAL_PRESERVE` | 116 | 3789 | 3789 |
| `REFERENCE_ONLY` | 11 | 286 | 307 |
| `TECHNICAL_IDENTIFIER_DEFER` | 175 | 47715 | 47715 |
| `FRONTEND_HANDOFF` | 127 | 1524 | 1524 |
| `BACKEND2_HANDOFF` | 112 | 2008 | 2008 |

Локальный scanner и точечный просмотр проверили новые инструкции. Сохранённые маркеры в активных документах объясняют границу с Актау или совместимость. Рост в справочных документах связан с предупреждениями. Исторические и отложенные файлы сохранили байты. Три старые сломанные ссылки в исторических отчётах из прошлого инвентаря сохранились как часть истории.

## Handoff для Owner

| Владельцы | Пути | Причина и влияние |
| --- | --- | --- |
| Frontend | `frontend/README.md`, `docs/production/FRONTEND_VPS_DEPLOYMENT.md`, `docs/production/FRONTEND_REVALIDATION.md`, `ops/frontend/README.md` | В инструкциях ещё есть ссылки или целевые ресурсы Актау. Карта явно обозначает их как справки. Согласовать замену рабочего README и новую процедуру релиза. |
| Frontend | `frontend/src/content/blog/`, `frontend/src/app/`, настройки SEO, карты и брендинга | Отдельная городская задача. Публикации, sitemap, robots, маршруты и runtime не входят в этот PR. |
| Backend 2 | `ops/sync/README.md`, `ops/postgres/README.md`, `docs/runbooks/{db-down,ingestion-failed}.md`, `docs/data/` | Унаследованные операторские команды и источники. Согласовать локальные инструкции и собственные ресурсы до любого подключения или работы с данными. |
| Backend 2 | `backend/prisma/`, `pipeline/`, `ops/sync/` | Данные, schema, адаптеры, магазины и расписание требуют отдельной задачи. |

После review и merge документации команда может начать работу из локальных worktree и использовать проверки с фикстурами. Публичные данные Шымкента, домены, SEO, источники и выкладка требуют дополнительных утверждений. GitHub settings, secrets, variables, environments, инфраструктура и ресурсы Актау не менялись. В новых инструкциях нет production endpoints Шымкента.

## Проверки

| Команда или проверка | Результат |
| --- | --- |
| `node scripts/ci/run-checks.mjs security` | PASS (0) с Node 24.10.0 и `CI_BASE_SHA=c2046b42c36676bf17389b3cf606d3ea0dabfb06`. Root-only status fixture штатно SKIP. |
| `node scripts/ci/run-checks.mjs ops` | PASS (0), 227 тестов. |
| `node scripts/ci/run-checks.mjs contracts` | PASS (0), 16 тестов и 11 ожидаемых SKIP без HTTP base. |
| `corepack pnpm@10.32.1 install --frozen-lockfile` и mock dev из onboarding | PASS (0). `/ru/catalog` и `/kk/catalog` ответили 200 на loopback и содержали ожидаемый `lang`. Собственный dev server завершён. |
| Markdown и shell blocks | PASS. CommonMark parser проверил относительные ссылки и anchors в изменённых Markdown. `bash -n` / `sh -n` проверили синтаксис shell-блоков без выполнения операторских команд. Репозиторного markdown/link lint entry point не найдено. |
| `git diff --check`, scoped diff, `node scripts/ci/check-source.mjs` | PASS. Допустимый diff состоит из документации и инвентаря. |
| Workflow structure, `node scripts/deploy/verify-auto-deploy.mjs`, `node scripts/deploy/verify-part15.mjs`, `node scripts/network/verify-part14.mjs` | PASS. Автоматическое чтение YAML подтвердило тот же набор jobs, identities, зависимостей и разрешённых команд offline. |
| Полные локальные Go/Frontend/Schema/Pipeline, disposable DB/Staging для doc-only ветки | NOT_RUN локально. Обязательная квалификация выполняется в hosted CI. |
| Production, live providers, ручной deploy, импорт, scraping и Siri | NOT_RUN. |

Ошибок проверок после завершения изменений не осталось. Одна промежуточная команда генерации инвентаря остановилась на синтаксисе `sed` до сканирования. Повтор с Python прошёл. Первый проход scanner принял слово SSH в запрете AGENTS за команду. Повтор проверил реальные командные строки и домены. Первичный запрос PR metadata в GitHub CLI отклонил неизвестное поле `baseRefOid`. Повтор через поддерживаемые поля CLI и REST подтвердил base и mergeability.

## Изменённые пути

```text
M	AGENTS.md
M	README.md
M	backend-go/README.md
M	contracts/README.md
M	deploy/README.md
M	docs/README.md
A	docs/developer-onboarding.md
M	docs/production/API_V1_CONTRACT.md
M	docs/production/AUTO_DEPLOY_SETUP.md
M	docs/production/GITHUB_BRANCH_PROTECTION.md
M	docs/production/OBSERVABILITY_ALERT_POLICY.md
M	docs/production/STAGING_PLAN.md
M	docs/production/SZPT.md
A	docs/production/reports/shymkent-market-repository-readiness-inventory.tsv
A	docs/runbooks/README.md
M	docs/runbooks/api-down.md
M	docs/runbooks/redis-down.md
M	docs/runbooks/rollback.md
M	docs/runbooks/secret-rotation.md
M	ops/monitor/README.md
M	ops/status/README.md
M	scripts/ci/README.md
M	scripts/perf/README.md
A	docs/production/reports/shymkent-market-repository-readiness-report.md
```

Следующий шаг — независимое review этого PR. Исправления идут в той же ветке, папке и PR с новым exact-HEAD архивом. Merge документации требует отдельного решения Owner.
