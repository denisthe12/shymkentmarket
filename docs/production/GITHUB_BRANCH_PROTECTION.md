# Ветки и CI Gate в Shymkent Market

## Общая политика

Каждый участник ведёт задачу в отдельной ветке и открывает один PR в `main`. Исправления по review идут коммитами в той же ветке и из того же worktree. Удаление `main` и force-push запрещены. [Работа с веткой и worktree](../developer-onboarding.md#клон-и-рабочее-дерево).

[CI workflow](../../.github/workflows/ci.yml) проверяет PR и push в `main`. Унаследованный фильтр также включает `integrate/full-stack`. **CI Gate** требует успеха Contracts, Go Quality, DB Schema, Frontend, Pipeline Quality, Security, PostgreSQL Integration и Ephemeral Staging. Сверяйте результаты с точным PR HEAD и актуальной базой.

Codex может выполнить штатный merge после независимого review с вердиктом `APPROVED`, явного разрешения Owner и green CI на точном HEAD. Внешнее review в ChatGPT и одобрение в GitHub — отдельные события. Соблюдайте правила GitHub, действующие в момент merge.

## Фактические правила GitHub

**CONFIGURED** по read-only API на 19 ноября 2026. GitHub возвращал `protected: true` для `main`. [Активный ruleset](https://github.com/denisthe12/shymkentmarket/rules/27592978) применяется к default branch и содержит четыре правила:

- Требуется PR. Разрешён только merge commit. GitHub требует 0 встроенных review approvals, независимое review выполняется по процессу команды.
- Обязательный check — `CI Gate` от GitHub Actions. Включено требование актуального base.
- Удаление и non-fast-forward для `main` запрещены.
- Список bypass actors пуст.

Ruleset обеспечивает технические ограничения. Legacy endpoint branch protection отдельно вернул `404 Branch not protected`. Это ответ о classic protection, а эффективные правила подтверждены через `rules/branches/main`. Проверяйте состояние заново перед merge. Настройки меняет Owner отдельным решением.

Зелёный merge сам по себе не создаёт релиз. [Границы staging и production](STAGING_PLAN.md).
