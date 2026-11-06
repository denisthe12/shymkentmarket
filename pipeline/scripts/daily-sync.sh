#!/usr/bin/env bash
# Ежедневное обновление цен: четыре скрапера параллельно → словарь → cmd/ingest. Без LLM.
# Нужные env: APP_ENV, INGEST_DATABASE_URL, INGEST_MAX_STORE_DROP_PERCENT (+ INGEST_PRODUCTION_APPLY_CONFIRM=1 в production).
# Необязательные env:
#   SOURCES_DIR  — каталог source-файлов сетей (по умолчанию data/sources);
#   SYNC_OUT_DIR — каталог bundle.json/unmapped.json (по умолчанию data/sync);
#     относительные пути считаются от корня репозитория, абсолютные остаются как есть;
#   SYNC_MAX_SOURCE_AGE_HOURS — сколько часов можно публиковать прошлый удачный файл упавшей сети (по умолчанию 36);
#   SCRAPE_TIMEOUT_SEC — лимит времени на один скрапер в секундах (по умолчанию 720); зависший скрапер
#     убивается и считается упавшим, чтобы медленная сеть не блокировала публикацию остальных;
#   RETENTION_DATABASE_URL — строка подключения роли aktau_retention_writer; пусто или не задано — очистка старых snapshot пропускается;
#   RETENTION_KEEP_SNAPSHOTS — сколько последних опубликованных snapshot хранить (по умолчанию 14);
#   RETENTION_PRODUCTION_APPLY_CONFIRM=1 — подтверждение удаления в production (читает cmd/prune).
# Упавший скрапер не перезаписывает свой source-файл, поэтому sync берёт прошлый удачный (если он не старше лимита).
# Коды выхода:
#   0 — все четыре скрапера удачны, snapshot опубликован;
#   1 — ошибка sync/ingest или упали все четыре скрапера (snapshot не опубликован);
#   3 — snapshot опубликован, но хотя бы одна сеть взята из прошлого удачного файла
#       (в журнале строка "[sync] stale stores: <list>");
#   4 — snapshot опубликован, но очистка старых snapshot упала (в stderr строка "[sync] retention failed");
#       приоритет кодов: 3 важнее 4, 4 важнее 0.

# Без -e на этапе скрапа: упавший скрапер не должен останавливать скрипт до pnpm sync
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT/pipeline" || exit 1

# Абсолютный путь к bundle: ниже скрипт переходит в backend-go
SYNC_OUT="${SYNC_OUT_DIR:-data/sync}"
case "$SYNC_OUT" in
  /*) ;;
  *) SYNC_OUT="$REPO_ROOT/$SYNC_OUT" ;;
esac
BUNDLE="$SYNC_OUT/bundle.json"

STORES=(dina dana fixprice anvar)
started=$SECONDS

# Лимит на один скрапер: TERM по истечении, через 30 с принудительный KILL (код выхода 124 / 137).
# Должен быть заметно меньше TimeoutStartSec юнита (20 мин), чтобы остались время на sync и ingest.
SCRAPE_TIMEOUT="${SCRAPE_TIMEOUT_SEC:-720}"
case "$SCRAPE_TIMEOUT" in
  '' | *[!0-9]* | 0)
    echo "[sync] invalid SCRAPE_TIMEOUT_SEC, using 720" >&2
    SCRAPE_TIMEOUT=720
    ;;
esac

# Скраперы фоном; каждая строка вывода помечена сетью, итог сети подоболочка печатает сама в момент завершения
pids=()
for s in "${STORES[@]}"; do
  (
    t0=$SECONDS
    timeout --kill-after=30s "${SCRAPE_TIMEOUT}s" pnpm "scrape:$s" 2>&1 | sed -u "s/^/[$s] /"
    code=$?
    echo "[sync] $s exit=$code took=$((SECONDS - t0))s"
    if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
      echo "[sync] $s timed out after ${SCRAPE_TIMEOUT}s, treating as failed" >&2
    fi
    exit "$code"
  ) &
  pids+=("$!")
done

failed=()
for i in "${!STORES[@]}"; do
  if ! wait "${pids[$i]}"; then
    failed+=("${STORES[$i]}")
  fi
done

if [ "${#failed[@]}" -eq "${#STORES[@]}" ]; then
  echo "[sync] all scrapers failed, nothing to publish"
  exit 1
fi

# Публикация: любая ошибка → код 1 (ненулевой код pnpm/go не должен совпасть с кодом 3)
set -e
trap 'echo "[sync] publish step failed" >&2; exit 1' ERR

pnpm sync
cd "$REPO_ROOT/backend-go"
export GOTOOLCHAIN=local
go run ./cmd/ingest -bundle "$BUNDLE"
go run ./cmd/ingest -bundle "$BUNDLE" -apply

trap - ERR
set +e

# Очистка старых snapshot после публикации: её ошибка не отменяет уже опубликованный snapshot
prune_failed=0
if [ -n "${RETENTION_DATABASE_URL:-}" ]; then
  if ! go run ./cmd/prune -keep "${RETENTION_KEEP_SNAPSHOTS:-14}" -apply; then
    echo "[sync] retention failed" >&2
    prune_failed=1
  fi
else
  echo "[sync] retention skipped"
fi

echo "[sync] done in $((SECONDS - started))s"

if [ "${#failed[@]}" -gt 0 ]; then
  echo "[sync] stale stores: ${failed[*]}"
  exit 3
fi
if [ "$prune_failed" -ne 0 ]; then
  exit 4
fi
exit 0
