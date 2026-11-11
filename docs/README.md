# Карта документации

Документы делятся на две группы.

- **Живые.** По ним работают, они должны совпадать с production. Нашли расхождение —
  исправьте документ в том же PR, что и изменение.
- **Исторические.** Фиксируют момент времени: план, отчёт, передачу работы. Их не
  переписывают задним числом; в шапке такого файла стоит пометка «Исторический документ».

Состояние production на 2026-11-11: Go API на VPS за Cloudflare Tunnel, фронтенд на
Vercel, БД Supabase, sync цен по таймерам на VPS, монитор API и ежедневный отчёт в Telegram.
NestJS удалён из репозитория (PR #106/#107); C2 удалён (PR #93).

## Живые документы

| Тема | Где |
| --- | --- |
| Обзор проекта, локальный запуск | [README.md](../README.md) |
| Активный релиз API, откат | [deploy/README.md](../deploy/README.md) — единственное место, где записан SHA |
| Брокер деплоя и одобрение релиза | [production/AUTO_DEPLOY_SETUP.md](production/AUTO_DEPLOY_SETUP.md) |
| Runbooks: API, БД, Redis, sync, откат, секреты | [runbooks/](runbooks/) |
| Go API: сборка, тесты, конфигурация | [backend-go/README.md](../backend-go/README.md) |
| Контракт API v1 | [production/API_V1_CONTRACT.md](production/API_V1_CONTRACT.md), [contracts/README.md](../contracts/README.md) |
| Sync цен на VPS: таймеры, коды выхода, обновление кода | [ops/sync/README.md](../ops/sync/README.md), [data/SYNC_RUNBOOK.md](data/SYNC_RUNBOOK.md) |
| Монитор API и ежедневный отчёт | [ops/monitor/README.md](../ops/monitor/README.md), [production/OBSERVABILITY_ALERT_POLICY.md](production/OBSERVABILITY_ALERT_POLICY.md) |
| Бэкапы и восстановление БД, роли | [ops/postgres/README.md](../ops/postgres/README.md) |
| Ревалидация фронтенда | [production/FRONTEND_REVALIDATION.md](production/FRONTEND_REVALIDATION.md) |
| Источники магазинов | [data/ANVAR_SOURCE.md](data/ANVAR_SOURCE.md), [data/FIXPRICE_SOURCE.md](data/FIXPRICE_SOURCE.md) |
| CI, защита веток, staging | [production/GITHUB_BRANCH_PROTECTION.md](production/GITHUB_BRANCH_PROTECTION.md), [production/STAGING_PLAN.md](production/STAGING_PLAN.md) |
| Рабочий журнал фронтенда | [context/06_FRONTEND_WORKLOG.md](context/06_FRONTEND_WORKLOG.md) |

Записи Part14 о периметре ([NETWORK_PERIMETER](production/NETWORK_PERIMETER.md),
[CLOUDFLARE_ACTIVATION_CHECKLIST](production/CLOUDFLARE_ACTIVATION_CHECKLIST.md),
[ops/cloudflare](../ops/cloudflare/README.md)) описывают устройство периметра и остаются в силе,
но их статусные строки («Go API: NOT DEPLOYED») закреплены проверкой
`scripts/network/verify-part14.mjs` и относятся к Part14. Текущее состояние — `deploy/README.md`.

## Исторические документы

| Где | Что |
| --- | --- |
| `production/reports/` | Отчёты Part 01–17 и релизов, доказательства выкаток |
| `superpowers/plans/`, `superpowers/specs/`, `superpowers/reports/` | Спецификации, планы и отчёты задач |
| `00_TECHNICAL_SPEC.md`, `01_RISKS_AND_DECISIONS.md` | ТЗ и решения MVP (NestJS-версия) |
| `05_BACKEND_2_IMPLEMENTATION_PLAN.md`, `BACKEND_2_AGENT_AUDIT_INSTRUCTION.md`, `backend-2/`, `backend-1/reports/`, `integration/` | Работа команд над MVP (сентябрь 2026) |
| `PRODUCTION_ROADMAP_AKTAU_MARKET.md` | Дорожная карта выхода в production (октябрь 2026) |
| `context/` (кроме рабочего журнала) | Распределение задач и переписка Frontend ↔ Backend |
| `data/SCRUM-7_*`, `data/DEMO_BASKET_PLAN.md`, остальные отчёты в `data/` | Задачи и расследования по данным |
| `production/POSTGRES_LAYER.md`, `production/PART_17_FRONTEND_HANDOFF.md`, `production/PERFORMANCE_BASELINE.md` | Part 04, Part 17 и замеры Part 13 |
