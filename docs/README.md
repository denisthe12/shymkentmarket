# Документация Shymkent Market

Текущий проект — `denisthe12/shymkentmarket`. Публичный API реализован на Go, веб-интерфейс — Next.js App Router (RU/KK). Опубликованные данные сервис читает из PostgreSQL. Production API, сайт, домены, БД и провайдеры Шымкента имеют статус **NOT_CONFIGURED**. Каталог магазинов, адреса, цены, источники, публикация и её расписание имеют статус **PLANNED**. CI проверяет код на локальных или одноразовых сервисах.

## ACTIVE_SHYMKENT

| Документ | Для чего |
| --- | --- |
| [README](../README.md), [onboarding WSL](developer-onboarding.md), [AGENTS](../AGENTS.md) | Обзор, локальный запуск, работа по веткам и review. |
| [Go API](../backend-go/README.md), [контрактные тесты](../contracts/README.md), [OpenAPI v1](../contracts/openapi.yaml) | Архитектура и сохранённый wire-контракт. Название и origin в OpenAPI унаследованы. |
| [СЗПТ](production/SZPT.md) | Правила и код API. Фактическая доступность зависит от будущего каталога Шымкента. |
| [Локальный CI](../scripts/ci/README.md), [одноразовый staging](production/STAGING_PLAN.md), [правила PR и CI Gate](production/GITHUB_BRANCH_PROTECTION.md) | Проверки без production-доступа. |

Начните с [единого onboarding](developer-onboarding.md). Jira-задачи Frontend,
Backend 1 и Backend 2 ведутся в собственных ветках и PR по общим правилам.

## INHERITED_REFERENCE

Пути, имена ресурсов, роли, URL, release SHA и команды в этих справках относятся к Актау. Не выполняйте их против инфраструктуры Актау и не переносите настройки в Шымкент. Примеры с loopback применимы только после подтверждения одноразовой цели.

| Область | Справка |
| --- | --- |
| API v1 | [Описание эталонного контракта](production/API_V1_CONTRACT.md). Исторический origin не используется для тестов Шымкента. |
| Релиз API и брокер | [Deploy](../deploy/README.md), [auto-deploy](production/AUTO_DEPLOY_SETUP.md). Workflow сохраняет недоступность release jobs для Шымкента. |
| Диагностика и эксплуатация | [Runbooks](runbooks/), [status helper](../ops/status/README.md), [монитор](../ops/monitor/README.md), [alert policy](production/OBSERVABILITY_ALERT_POLICY.md), [performance rehearsal](../scripts/perf/README.md). |
| PostgreSQL и pipeline | [Backup и restore](../ops/postgres/README.md), [sync](../ops/sync/README.md), [sync runbook](data/SYNC_RUNBOOK.md). Материалы для Backend 2, запуск источников не утверждён. |
| Frontend | [Унаследованный README](../frontend/README.md), [VPS](production/FRONTEND_VPS_DEPLOYMENT.md), [cache invalidation](production/FRONTEND_REVALIDATION.md), [служебный helper](../ops/frontend/README.md). Для локального запуска в Шымкенте используйте onboarding. |

## HISTORICAL_AKTAU

- [Отчёты и доказательства выкаток](production/reports/) сохраняют исходную историю. Отдельные отчёты Shymkent идентифицируются по задаче и названию.
- [Планы и спецификации](superpowers/), [рабочий журнал Frontend](context/06_FRONTEND_WORKLOG.md), [приёмка Frontend Part 17](production/PART_17_FRONTEND_HANDOFF.md) описывают прежние этапы.
- [Периметр Part 14](production/NETWORK_PERIMETER.md), [Cloudflare checklist](production/CLOUDFLARE_ACTIVATION_CHECKLIST.md), [артефакты Cloudflare](../ops/cloudflare/README.md), [PostgreSQL Part 04](production/POSTGRES_LAYER.md) и [измерения Part 13](production/PERFORMANCE_BASELINE.md) служат историческими источниками.

## FUTURE_TASK

| Ответственный | Решение или работа |
| --- | --- |
| Backend 1 / Owner | Отдельно утвердить Shymkent release и принадлежащие ему сервисы. Go API и интеграция в текущей зоне Backend 1. |
| Backend 2 | Утвердить собственные PostgreSQL, источники и структуру каталога, mapping, цены, публикацию и расписание. |
| Frontend | Городской интерфейс, брендинг, публикации, карта, SEO, sitemap, robots и canonical. |

Работу в чужой зоне согласуйте с Owner и ответственным коллегой по [правилам репозитория](../AGENTS.md).
