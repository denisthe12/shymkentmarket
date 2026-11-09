#!/usr/bin/env bash
# Еженедельный полный скрап (SCRAPE_ALL=1) без публикации: обновляет полные source-файлы,
# пересчитывает кандидаты наборов Dina (категории) и Dana (подразделы) и unmapped.json для разбора новых товаров. Ingest НЕ запускается.
# Пишет в data/sources-full/ и data/sync-full/, чтобы не затереть узкие ежедневные файлы.
# Env для БД не нужны. Результат: data/sources-full/dina-scope-categories.candidate.json и dana-scope-sections.candidate.json
# (сравнить с data/mapping/dina-scope-categories.json и dana-scope-sections.json, закоммитить вручную) и data/sync-full/unmapped.json.
# Коды выхода: 0 — всё удачно; ненулевой — упал скрапер (scope и sync не запускаются), scope-шаг или sync.
# Упавший scope-шаг не пропускает sync: unmapped.json обновляется всегда, а скрипт в конце выходит с кодом 1.
# RUN_STATUS_DIR — каталог файлов прогонов: скрипт пишет туда weekly-<UTC>.json (status running при старте, итог по выходу;
#   убитый прогон остаётся running), хранит 60 самых новых daily-/weekly-файлов. Пусто или не задано — ничего не пишется.
set -euo pipefail
cd "$(dirname "$0")/.."

export SCRAPE_ALL=1 SOURCES_DIR=data/sources-full SYNC_OUT_DIR=data/sync-full

STORES=(dina dana fixprice)
started=$SECONDS
scope_failed=()

# Файл прогона для ежедневного отчёта (no-op при пустом RUN_STATUS_DIR)
RUN_DIR="${RUN_STATUS_DIR:-}"
CODES_DIR=""
if [ -n "$RUN_DIR" ]; then
  if mkdir -p -m 0755 "$RUN_DIR" 2>/dev/null; then
    CODES_DIR="$(mktemp -d 2>/dev/null)" || CODES_DIR=""
  else
    echo "[full] cannot create RUN_STATUS_DIR, run file disabled" >&2
    RUN_DIR=""
  fi
fi
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_NAME="weekly-$RUN_STAMP.json"
RUN_STARTED="${RUN_STAMP:0:4}-${RUN_STAMP:4:2}-${RUN_STAMP:6:2}T${RUN_STAMP:9:2}:${RUN_STAMP:11:2}:${RUN_STAMP:13:2}Z"

# $1 — running|finished, $2 — код выхода (для finished). Ошибка записи не влияет на код выхода скрипта.
run_status_write() {
  [ -n "$RUN_DIR" ] || return 0
  local st=$1 code=${2:-} fin=null ec=null s c i list="" scope="" tmp
  if [ "$st" = finished ]; then
    fin="\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
    ec=$code
  fi
  for s in "${STORES[@]}"; do
    c=null
    if [ -n "$CODES_DIR" ] && [ -s "$CODES_DIR/$s.code" ]; then c="$(<"$CODES_DIR/$s.code")"; fi
    list="$list${list:+,}\"$s\":$c"
  done
  for ((i = 0; i < ${#scope_failed[@]}; i++)); do
    scope="$scope${scope:+,}\"${scope_failed[$i]}\""
  done
  tmp="$RUN_DIR/.tmp-$RUN_NAME"
  printf '{"version":1,"kind":"weekly","startedAt":"%s","finishedAt":%s,"status":"%s","exitCode":%s,"published":false,"stores":{%s},"scopeFailed":[%s]}\n' \
    "$RUN_STARTED" "$fin" "$st" "$ec" "$list" "$scope" >"$tmp" &&
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

# Скраперы параллельно, тем же приёмом, что в daily-sync.sh
pids=()
for s in "${STORES[@]}"; do
  (
    t0=$SECONDS
    code=0
    pnpm "scrape:$s" 2>&1 | sed -u "s/^/[$s] /" || code=$?
    echo "[full] $s exit=$code took=$((SECONDS - t0))s"
    if [ -n "$CODES_DIR" ]; then echo "$code" >"$CODES_DIR/$s.code" || true; fi
    exit "$code"
  ) &
  pids+=("$!")
done

# Ждём всех, и только потом решаем: любой упавший скрапер → exit 1
failed=()
for i in "${!STORES[@]}"; do
  if ! wait "${pids[$i]}"; then
    failed+=("${STORES[$i]}")
  fi
done
if [ "${#failed[@]}" -gt 0 ]; then
  echo "[full] failed scrapers: ${failed[*]}"
  exit 1
fi

# Падение scope-шага (например, у товаров Dana нет подраздела) не должно оставить unmapped.json без обновления
pnpm scope:dina --in ../data/sources-full/dina.json --out ../data/sources-full/dina-scope-categories.candidate.json || scope_failed+=(scope:dina)
pnpm scope:dana --in ../data/sources-full/dana.json --out ../data/sources-full/dana-scope-sections.candidate.json || scope_failed+=(scope:dana)
# Анвар не входит в недельный скрап, поэтому sync требует только сети из STORES, а не SYNC_STORES из env
SYNC_STORES=DINA,DANA,FIX_PRICE SYNC_MAX_SOURCE_AGE_HOURS=36 pnpm sync

echo "[full] done in $((SECONDS - started))s"
echo "[full] candidates written; compare with data/mapping/dina-scope-categories.json and dana-scope-sections.json, commit manually"

if [ "${#scope_failed[@]}" -gt 0 ]; then
  echo "[full] failed scope steps: ${scope_failed[*]} (see candidate files)"
  exit 1
fi
