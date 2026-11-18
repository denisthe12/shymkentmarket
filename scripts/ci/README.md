# Локальный запуск CI

Работайте из корня тематического worktree на файловой системе Linux. Нужны Node 24.10.0, pnpm 10.32.1 и версия Go из [go.mod](../../backend-go/go.mod). Настройка pnpm без записи в каталог Node описана в [общем onboarding](../../docs/developer-onboarding.md#инструменты). Скрипты устанавливают `GOTOOLCHAIN=local`. Для Go race checks нужен C-компилятор, для Ops — OpenSSL и Linux-инструменты из тестов. Версию pnpm проверьте и в `frontend/`, у которого свой lockfile.

## Группы проверок

```bash
node scripts/ci/run-checks.mjs contracts
node scripts/ci/run-checks.mjs go
node scripts/ci/run-checks.mjs schema
node scripts/ci/run-checks.mjs frontend
node scripts/ci/run-checks.mjs pipeline
node scripts/ci/run-checks.mjs security
node scripts/ci/run-checks.mjs ops
```

Используйте группы по области задачи и требования CI. Frontend собирает тестовые профили, проверяет Chromium/Playwright и может скачивать зависимости сборки. Публичные origin и production credentials проекта для этого не нужны. Schema использует нерабочие loopback placeholders для валидации.

## Одноразовый PostgreSQL и staging

До запуска проверьте Docker context, локальный daemon и принадлежность ресурсов. Для записывающих тестов подтвердите фактический сервер, роль и базу внутри нового контейнера и через назначенный loopback-порт. Staging использует порты 18080, 18081 и 3100, они должны быть свободны. Не запускайте проверки с чужим Docker context или с production DSN. Не включайте `REFERENCE_RECORD`, если задача не разрешает изменение записанного контракта.

```bash
node scripts/ci/run-db-integration.mjs
node scripts/ci/run-ephemeral-staging.mjs
```

Скрипты создают собственный PostgreSQL 17 и применяют миграции к нему, затем используют синтетические фикстуры. Staging проверяет локальные Go/Next, HTTP parity и устойчивость к сбою БД. Права и имена с историческими идентификаторами внутри контейнеров служат совместимости фикстур. См. [границы staging](../../docs/production/STAGING_PLAN.md).

[Workflow CI](../../.github/workflows/ci.yml) определяет набор обязательных jobs и CI Gate. Записывайте выводы для точного HEAD PR и отмечайте локальные `PASS`, `FAIL`, `SKIP` и `NOT_RUN` отдельно.
