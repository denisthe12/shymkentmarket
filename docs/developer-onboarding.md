# Общий старт Shymkent Market

Используйте это руководство для любой задачи команды. Для работы в Windows запускайте Git, Node и Go внутри WSL и храните рабочее дерево на файловой системе Linux. Путь к клону и имя пользователя выбираете вы. Примеры используют Bash и обычные команды Git, pnpm и Go.

## Клон и рабочее дерево

Выполните один раз, если клона ещё нет:

```bash
repo_dir="$HOME/src/shymkentmarket"
mkdir -p "$(dirname "$repo_dir")"
git clone https://github.com/denisthe12/shymkentmarket.git "$repo_dir"
```

Укажите путь к своему клону и замените `example-task` идентификатором задачи в kebab-case. Перед созданием worktree проверьте вывод `git status`, обе ссылки origin и существующие рабочие деревья. Обе ссылки должны вести в `denisthe12/shymkentmarket`. GitHub HTTPS и SSH допустимы. Если каталог или ветка уже существуют для этой задачи, откройте существующий worktree.

```bash
repo_dir="$HOME/src/shymkentmarket"
task=example-task
task_root="$HOME/tmp"
task_branch="chore/$task"
task_dir="$task_root/$task"

cd "$repo_dir"
git status --short --branch
git remote get-url origin
git remote get-url --push origin
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
git rev-parse origin/main
git worktree list
```

После подтверждения baseline и свободных ветки и каталога:

```bash
mkdir -p "$task_root"
git worktree add -b "$task_branch" "$task_dir" origin/main
cd "$task_dir"
git status --short --branch
```

Одна задача использует одну ветку, один worktree и один PR в `main`. Review fixes идут туда же. Отчёт храните в `docs/production/reports/`, архив и SHA256 — непосредственно в `$task_root`. Пример Owner для Codex на этой машине — `/home/denis/tmp`. Руководство применимо и к уже существующему клону Owner на диске `D:`; путь на Windows задаётся только для его машины.

## Инструменты

Установите Node **24.10.0** и Go **1.27.4**, совпадающие с CI и [go.mod](../backend-go/go.mod). Для race detector Go нужен C-компилятор. Для локальных Security и Ops в WSL нужны Python 3, OpenSSL и `systemd-analyze`. Для полного Frontend CI нужны системные библиотеки Playwright Chromium. Docker используется только для отдельных одноразовых интеграционных прогонов.

Если настраиваете pnpm через Corepack, включите shim в каталоге своего пользователя. Команды не требуют записи в каталог установки Node. Если pnpm уже установлен отдельно, подтвердите ту же версию в корне и в пакетах.

```bash
mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
export COREPACK_ENABLE_AUTO_PIN=0
corepack enable --install-directory "$HOME/.local/bin" pnpm
corepack install --global pnpm@10.32.1
node --version
pnpm --version
go version
```

Не используйте настройки или секреты чужого проекта. Для первого запуска не копируйте `.env` и не настраивайте внешний API, источник магазинов или БД. Для начальной установки нужны публичные репозитории зависимостей. Скрипты CI ставят зависимости по lockfile каждого пакета.

## Локальные проверки

Из корня worktree:

```bash
node scripts/ci/run-checks.mjs contracts
node scripts/ci/run-checks.mjs go
node scripts/ci/run-checks.mjs schema
node scripts/ci/run-checks.mjs pipeline
node scripts/ci/run-checks.mjs security
node scripts/ci/run-checks.mjs ops
```

Schema только проверяет Prisma schema с локальными placeholder URL. Pipeline запускает тесты и typecheck. У него нет шага скрапинга, импорта или публикации в этой команде. Для короткой проверки Go без БД можно выполнить `(cd backend-go && GOTOOLCHAIN=local go test ./...)`. [Полный список групп](../scripts/ci/README.md).

## Интерфейс на фикстурах

В чистом worktree, из его корня:

```bash
cd frontend
pnpm install --frozen-lockfile
NEXT_PUBLIC_API_MODE=mock NEXT_PUBLIC_SITE_URL=http://localhost:3100 DEV_API_PROXY= \
  pnpm dev --hostname 127.0.0.1 --port 3100
```

Откройте `http://localhost:3100/ru/catalog` и `http://localhost:3100/kk/catalog`. Такой запуск использует локальные фикстуры и работает без Go API или PostgreSQL. Завершите сервер через Ctrl+C. Интерактивная карта может загружать публичные тайлы. Для проверки без тайлов используйте каталог или браузерный тест с подменой слоя карты. Для связи Next и Go используйте [одноразовый staging](../scripts/ci/README.md#одноразовый-postgresql-и-staging).

## Pull request

Для push войдите в свой GitHub-аккаунт с правом записи в Shymkent Market. Свою задачу ведите в отдельной ветке. Перед push проверьте diff, fetch и push URL, рабочий каталог и [границы CI и релиза](production/STAGING_PLAN.md). После коммита отправьте только свою ветку и откройте PR в `main`:

```bash
git diff --check origin/main...HEAD
git push -u origin "$task_branch"
```

В PR сверяйте CI Gate с точным HEAD. Merge проходит по [общей политике команды](production/GITHUB_BRANCH_PROTECTION.md). Источники магазинов, городские данные, SEO, рабочие БД и production имеют отдельные задачи и не требуются для локального старта. [Карта документации и унаследованных справок](README.md).
