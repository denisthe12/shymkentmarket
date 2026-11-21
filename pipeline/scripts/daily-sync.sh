#!/usr/bin/env bash
# Ежедневное обновление цен: скраперы параллельно → словарь → cmd/ingest. Без LLM.
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
#   0 — все скраперы удачны, snapshot опубликован;
#   1 — ошибка sync/ingest или упали все скраперы (snapshot не опубликован);
#   3 — snapshot опубликован, но хотя бы одна сеть взята из прошлого удачного файла
#       (в журнале строка "[sync] stale stores: <list>");
#   4 — snapshot опубликован, но очистка старых snapshot упала (в stderr строка "[sync] retention failed");
#       приоритет кодов: 3 важнее 4, 4 важнее 0.
# RUN_STATUS_DIR — каталог файлов прогонов: скрипт пишет туда daily-<UTC>.json (status running при старте, итог по выходу;
#   убитый прогон остаётся running), хранит 60 самых новых daily-/weekly-файлов. Пусто или не задано — ничего не пишется.

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

STORES=(magnum)
started=$SECONDS
failed=()

# Файл прогона для ежедневного отчёта (no-op при пустом RUN_STATUS_DIR)
RUN_DIR="${RUN_STATUS_DIR:-}"
CODES_DIR=""
published=false
retention_state=null
if [ -n "$RUN_DIR" ]; then
  if mkdir -p -m 0755 "$RUN_DIR" 2>/dev/null; then
    CODES_DIR="$(mktemp -d 2>/dev/null)" || CODES_DIR=""
  else
    echo "[sync] cannot create RUN_STATUS_DIR, run file disabled" >&2
    RUN_DIR=""
  fi
fi
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_NAME="daily-$RUN_STAMP.json"
RUN_STARTED="${RUN_STAMP:0:4}-${RUN_STAMP:4:2}-${RUN_STAMP:6:2}T${RUN_STAMP:9:2}:${RUN_STAMP:11:2}:${RUN_STAMP:13:2}Z"

# $1 — running|finished, $2 — код выхода (для finished). Ошибка записи не влияет на код выхода скрипта.
run_status_write() {
  [ -n "$RUN_DIR" ] || return 0
  local st=$1 code=${2:-} fin=null ec=null s c i list="" stale="" tmp
  if [ "$st" = finished ]; then
    fin="\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
    ec=$code
  fi
  for s in "${STORES[@]}"; do
    c=null
    if [ -n "$CODES_DIR" ] && [ -s "$CODES_DIR/$s.code" ]; then c="$(<"$CODES_DIR/$s.code")"; fi
    list="$list${list:+,}\"$s\":$c"
  done
  if [ "$published" = true ]; then
    for ((i = 0; i < ${#failed[@]}; i++)); do
      stale="$stale${stale:+,}\"${failed[$i]}\""
    done
  fi
  tmp="$RUN_DIR/.tmp-$RUN_NAME"
  printf '{"version":1,"kind":"daily","startedAt":"%s","finishedAt":%s,"status":"%s","exitCode":%s,"published":%s,"stores":{%s},"stale":[%s],"retention":%s}\n' \
    "$RUN_STARTED" "$fin" "$st" "$ec" "$published" "$list" "$stale" "$retention_state" >"$tmp" &&
    chmod 0644 "$tmp" && mv -f "$tmp" "$RUN_DIR/$RUN_NAME"
}

run_signaled=0
run_status_final() {
  set +e
  # Остановка по сигналу: файл остаётся running (как у убитого прогона), $? в EXIT-ловушке тут недостоверен
  if [ "$run_signaled" -eq 0 ]; then
    run_status_write finished "$1" || true
    if [ -n "$RUN_DIR" ]; then
      ls -1t "$RUN_DIR"/daily-*.json "$RUN_DIR"/weekly-*.json 2>/dev/null | tail -n +61 | xargs -r rm -f || true
    fi
  fi
  [ -z "$CODES_DIR" ] || rm -rf "$CODES_DIR" || true
  return 0
}
trap 'run_status_final $?' EXIT
# TERM/INT/HUP: пометить, снять ловушку и повторить сигнал, чтобы код выхода остался 128+N
run_on_signal() {
  run_signaled=1
  trap - "$1"
  kill -s "$1" $$
}
trap 'run_on_signal TERM' TERM
trap 'run_on_signal INT' INT
trap 'run_on_signal HUP' HUP
run_status_write running || true

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
    if [ -n "$CODES_DIR" ]; then echo "$code" >"$CODES_DIR/$s.code" || true; fi
    if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
      echo "[sync] $s timed out after ${SCRAPE_TIMEOUT}s, treating as failed" >&2
    fi
    exit "$code"
  ) &
  pids+=("$!")
done

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
published=true

trap - ERR
set +e

# Очистка старых snapshot после публикации: её ошибка не отменяет уже опубликованный snapshot
prune_failed=0
if [ -n "${RETENTION_DATABASE_URL:-}" ]; then
  if ! go run ./cmd/prune -keep "${RETENTION_KEEP_SNAPSHOTS:-14}" -apply; then
    echo "[sync] retention failed" >&2
    prune_failed=1
    retention_state='"failed"'
  else
    retention_state='"ok"'
  fi
else
  retention_state='"skipped"'
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
