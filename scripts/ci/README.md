# Локальный запуск CI

Нужны Docker, Node, pnpm и Go из `backend-go/go.mod`: скрипты ставят `GOTOOLCHAIN=local` и сами версию не скачивают. На Windows запускать из Git Bash.

```bash
node scripts/ci/run-db-integration.mjs
```

```bash
node scripts/ci/run-checks.mjs go
```

На Windows также работают группы `pipeline`, `contracts` и `frontend`. Группы `nest`, `security` и `ops` там пока не проходят, их проверяет только CI.

На Windows тесты идут без `-race`: ему нужен компилятор C. Гонки проверяет только CI на Linux.
