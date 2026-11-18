# Go API Shymkent Market

`backend-go/` реализует публичный API каталога, предложений, аналитики, СЗПТ и Voice. Данные читаются из опубликованного PostgreSQL snapshot. Сбор и публикация выполняются отдельно в pipeline. `backend/` содержит Prisma schema и миграции. Production API и БД Шымкента имеют статус **NOT_CONFIGURED**.

Начните с [локального CI](../scripts/ci/README.md) и [карты документации](../docs/README.md). Для сквозной проверки используйте одноразовый staging с фикстурами. История релизов и операторские команды Актау находятся в [унаследованном справочнике](../deploy/README.md). Их цели и адреса не применяются к Шымкенту.

## Recorded reference

[OpenAPI v1](../contracts/openapi.yaml) фиксирует wire behavior. Заголовок и origin унаследованы от Актау. Эталонные ответы в `tests/integration/testdata/reference/` были записаны до удаления NestJS. Ephemeral Staging воспроизводит их локально. Отсутствующий или лишний запрос считается расхождением.

Обычные проверки не используют `REFERENCE_API_BASE_URL` и не устанавливают `REFERENCE_RECORD`. Перезапись corpus и изменение файла OpenAPI требуют отдельно утверждённой контрактной задачи. [Правила контрактных тестов](../contracts/README.md).

## Локальные проверки

Go 1.27.4 закреплён в [go.mod](go.mod). Из корня worktree:

```bash
node scripts/ci/run-checks.mjs go
```

Для быстрой проверки пакетов без базы:

```bash
cd backend-go
GOTOOLCHAIN=local rtk go test ./...
```

Команда CI дополнительно проверяет формат, go.mod/go.sum, race detector, vet, staticcheck, govulncheck и сборки API, ingest, prune. Теги интеграции не следует запускать со случайным окружением. Используйте [одноразовый PostgreSQL и staging](../scripts/ci/README.md#одноразовый-postgresql-и-staging), если задача затрагивает права, SQL или HTTP parity.

## Конфигурация API

Конфигурация читается из окружения процесса. Go не подгружает `.env` автоматически. Для ручного запуска нужна своя заранее проверенная одноразовая база с нужной схемой и ограниченной ролью. Начните в отдельной чистой оболочке без унаследованных настроек БД, Redis, Gemini или backup:

```bash
env -i HOME="$HOME" PATH="$PATH" bash --noprofile --norc
```

В этой оболочке из корня worktree введите DSN **проверенной локальной БД** скрытым вводом. Команда API слушает `:18080` на всех интерфейсах окружения. Используйте изолированную локальную среду без внешнего доступа к порту.

```bash
cd backend-go
read -rs DATABASE_URL
export DATABASE_URL
GOTOOLCHAIN=local APP_ENV=test PORT=18080 CORS_ALLOWED_ORIGINS=http://localhost:3100 \
  rtk go run ./cmd/api
```

После выхода завершите отдельную оболочку. В другой локальной оболочке:

```bash
rtk curl http://127.0.0.1:18080/health/live
rtk curl http://127.0.0.1:18080/health/ready
```

| Настройка | Требование |
| --- | --- |
| `APP_ENV` | `development`, `test` или `production`. Для локального запуска используйте `test` или `development`. |
| `DATABASE_URL` | PostgreSQL URL. Для локального запуска — только подтверждённая одноразовая база. |
| `CORS_ALLOWED_ORIGINS` | Точные origins через запятую. Для локального UI — origin из [onboarding](../docs/developer-onboarding.md). |
| `PORT` | По умолчанию 8080. Пример и CI API используют 18080. |
| `TRUSTED_PROXY_CIDRS`, `LOG_LEVEL` | Доверенные proxy выключены по умолчанию. Уровень журнала по умолчанию `info`. |
| `RATE_LIMIT_RPS` / `RATE_LIMIT_BURST` | По умолчанию 20 / 40. |
| `VOICE_RATE_LIMIT_RPS`, `VOICE_RATE_LIMIT_BURST`, `VOICE_MAX_CONCURRENCY` | По умолчанию 2, 4 и 4. |

В production код требует HTTPS CORS, restricted database identity, Redis и Gemini. Унаследованное имя `aktau_api_runtime` — техническое ограничение текущей конфигурации и фикстур. Идентификация базы и сервисов Шымкента входит в будущую release-задачу. Для локального GET-профиля провайдеры Voice не нужны.

## HTTP и диагностика

- `/health/live` отвечает 200 без обращения к БД. `/health/ready` использует один активный Ping с дедлайном 5 секунд. Кэш успеха — 1 секунда, ошибки — 250 мс. Пока свежего результата нет и Ping уже выполняется, остальные запросы получают 503 без ожидания пула. Статусы readiness — 200/503 с `Cache-Control: no-store`.
- Результаты диагностик содержат класс ошибки и request ID. DSN, сырые SQL и ошибки драйвера, payload Voice, координаты и session IDs не пишутся в журналы.
- Каталог и [СЗПТ](../docs/production/SZPT.md) читают текущий опубликованный snapshot. Redis и NLP не участвуют в readiness.
- Пул использует режим read-only и statement timeout. Разграничение прав опирается на роль PostgreSQL. Исторические примеры ролей и отката относятся к Актау. [PostgreSQL Part 04](../docs/production/POSTGRES_LAYER.md).
