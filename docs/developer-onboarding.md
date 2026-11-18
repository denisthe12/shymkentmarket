# Первый запуск Shymkent Market в WSL

Работайте внутри WSL. Используйте Node 24.10.0, pnpm 10.32.1 и Go 1.27.4 по CI и `backend-go/go.mod`. Пакеты pnpm устанавливаются по отдельным lockfile. Для Go race checks нужен C-компилятор. Docker нужен только для одноразовых интеграционных прогонов.

## Создать рабочую копию

Если корневой checkout ещё отсутствует, выберите новый пустой каталог и клонируйте Shymkent:

```bash
git clone https://github.com/denisthe12/shymkentmarket.git /mnt/d/install/projects/ShymkentMarket
```

Из существующего корневого checkout проверьте состояние Git, fetch URL и отдельно push URL. Замените `example-task` согласованным идентификатором задачи. Создавайте ветку и каталог только если оба свободны, а требуемый baseline подтверждён:

```bash
cd /mnt/d/install/projects/ShymkentMarket
rtk git status --short --branch
git remote get-url origin
git remote get-url --push origin
git fetch --no-tags origin main
git worktree list
git worktree add -b docs/example-task /home/denis/tmp/example-task origin/main
cd /home/denis/tmp/example-task
```

Используйте существующие worktree, ветку и PR для последующих исправлений. Отчёт задачи храните в `docs/production/reports/`. Архив со списком разрешённых файлов, манифестом и SHA256 — непосредственно в `/home/denis/tmp`. Перед push и merge действуют [правила репозитория](../AGENTS.md).

## Проверки без подключения к сервисам рынка

Убедитесь, что `node --version`, `pnpm --version` и `go version` показывают указанные версии. Если используете Corepack, активируйте пин pnpm из CI и повторите проверку:

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
```

Из корня worktree:

```bash
node scripts/ci/run-checks.mjs contracts
node scripts/ci/run-checks.mjs go
node scripts/ci/run-checks.mjs security
node scripts/ci/run-checks.mjs ops
```

Для полного списка групп и требований одноразовых PostgreSQL и staging см. [локальный CI](../scripts/ci/README.md). Тесты получают фикстуры и loopback-адреса. Наличие кода и тестовых данных не подтверждает готовность production.

## Посмотреть интерфейс на фикстурах

Используйте чистый worktree без скопированных `.env`/локальных настроек поставщиков. Пример запускает dev-сервер только на loopback и не требует Go API или PostgreSQL:

```bash
cd frontend
corepack pnpm@10.32.1 install --frozen-lockfile
NEXT_PUBLIC_API_MODE=mock NEXT_PUBLIC_SITE_URL=http://localhost:3100 DEV_API_PROXY= \
  corepack pnpm@10.32.1 dev --hostname 127.0.0.1 --port 3100
```

Откройте `http://localhost:3100/ru/catalog` или `http://localhost:3100/kk/catalog`. Макет использует унаследованные фикстуры. Для проверки связки Next.js и Go используйте [одноразовый staging](../scripts/ci/README.md#одноразовый-postgresql-и-staging). Если проверяете карту вне Playwright в полностью офлайн-режиме, отключите сеть браузера: runtime карты содержит публичный слой тайлов, а в CI он подменён фикстурой.

## Что остаётся отдельными задачами

| Ответственный | Зона |
| --- | --- |
| Backend 1 / Owner | Go API, интеграция и отдельное решение о release, доменах и инфраструктуре Shymkent. |
| Backend 2 | Собственная БД, каталог, источники магазинов, mapping, данные, публикация и расписание. |
| Frontend | Городская локализация, интерфейс, статьи, брендинг, sitemap, robots и SEO. |

Процедуры Актау отмечены в [карте документации](README.md). Не используйте их адреса, роли, секреты, данные, таймеры или сервисы для запуска Шымкента.
