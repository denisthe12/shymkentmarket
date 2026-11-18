# Контрактные проверки API v1

[OpenAPI 3.1, версия 1.0.0](openapi.yaml) фиксирует wire-контракт публичного Go API. Заголовок и server URL Актау унаследованы от эталона и не задают origin Шымкента. [Описание эталонного контракта](../docs/production/API_V1_CONTRACT.md).

Из корня worktree с Node 24.10.0 и pnpm 10.32.1:

```bash
node scripts/ci/run-checks.mjs contracts
```

Группа устанавливает зависимости по lockfile, запускает Redocly и валидирует JSON-примеры через AJV, включая СЗПТ. Примеры синтетические. HTTP-проверки пропускаются, если не указан base URL.

## HTTP GET на одноразовом API

Ephemeral Staging запускает GET-профиль против принадлежащего прогону Go API. Если такой API уже запущен и проверен на localhost, из корня worktree:

```bash
cd contracts
CONTRACT_API_BASE_URL=http://127.0.0.1:18080 pnpm test:live
```

Имя команды `test:live` унаследовано. Для Шымкента используйте проверенный loopback, без URL production или данных Актау. Профиль отправляет только GET, обнаруживает IDs и фильтры через API и не запускает SQL, импорт или миграции. 429/500/503 envelopes проверяются отдельно без обращения к сервисам рынка.

## Fixture и Voice

Профиль `test:fixture` требует сервер с точным набором `examples/`. Старый NestJS-сервер фикстур был удалён. Go не подменяет runtime источник этим набором. Ephemeral Staging сравнивает HTTP JSON с [записанным эталоном](../backend-go/README.md#recorded-reference) на своём синтетическом каталоге. Внешние провайдеры и физический Siri smoke в эти проверки не входят.
