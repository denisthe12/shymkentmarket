# Ветки и CI Gate в Shymkent Market

Создавайте одну тематическую ветку и один PR в `main` на задачу. Исправления по review идут коммитами в той же ветке и из того же worktree. Главная ветка не обновляется прямым push. [Правила работы](../../AGENTS.md).

[CI workflow](../../.github/workflows/ci.yml) запускается для PR в `main` и push в `main`. В унаследованном фильтре также есть `integrate/full-stack`. Набор CI включает Contracts, Go Quality, DB Schema, Frontend, Pipeline Quality, Security, PostgreSQL Integration, Ephemeral Staging и **CI Gate**. Gate требует успеха всех восьми заданий. Сверяйте последний CI с точным PR HEAD.

Merge требует решения Owner и соблюдения настроек GitHub. Перед merge проверьте состояние base, review, конфликты и обязательные checks. GitHub rulesets и branch protection меняются отдельно. Статус или настройки Актау не описывают политику сервера Шымкента.

Зелёный merge сам по себе не создаёт релиз. [Границы staging и production](STAGING_PLAN.md).
