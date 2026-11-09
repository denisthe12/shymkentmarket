# Monitor Alert Delivery and Daily Sync Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Go API monitor never stops on a failed Telegram send (ALERT then RECOVERED always arrive, retried every run), and a daily 13:30 UTC Telegram report shows each sync run's result plus monitor health.

**Architecture:** Monitor state moves to v2 with an ordered `queue` of undelivered events; each 5-minute run probes the API, enqueues phase transitions and drains up to two events. Sync scripts write one JSON file per run into `RUN_STATUS_DIR`; a new one-shot `sync-report.mjs` (same release and user as the monitor, own timer) reads those files and the monitor state and sends one message.

**Tech Stack:** Node 24 ESM (`.mjs`, no new dependencies), node:test, bash, systemd units; pipeline tests in Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-monitor-delivery-and-sync-report-design.md`

## Global Constraints

- Node 24 only, no new npm dependencies; scripts stay ESM `.mjs` in `scripts/ops/`.
- Tests make no real network calls and never use real Telegram credentials (synthetic token `'123456789:' + 'S'.repeat(35)`, admin `'123456789'`).
- Never log or persist token, chat ID, request path or response bodies; outputs are fixed enums/counts only.
- `scripts/ops/*` tests are Linux-only (they reject root and Windows). Run them with the local CI tool, never on the Windows host: `node C:/Development/AdilBaga-local-ci/run-local.mjs ops` (Git Bash, from the repo root; exit 0 = pass, log in `C:/Development/AdilBaga-local-ci/logs/ops.log`).
- CI: no new jobs or job names; new test files are only appended to the `ops` list in `scripts/ci/run-checks.mjs`.
- Telegram copy is fixed exactly as in the spec (ALERT/RECOVERED lines, `· событие #xxxx`, ` (повтор, попытка N)`, report lines).
- Numbers from the spec: queue ≤ 10, ≤ 2 sends per monitor run, send timeout 10 000 ms, `TimeoutStartSec=90s` (monitor), Node flag `--network-family-autoselection-attempt-timeout=2000`, report at `13:30:00 UTC`, 3 report attempts 30 000 ms apart, `TimeoutStartSec=150s` (report), running run stale after 25 min, monitor stale after 15 min, keep 60 run files, Aktau = UTC+5.
- Commit after each task with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push until the user asks.

## Review Focus

- Report fires late (`Persistent=true` after VPS downtime, e.g. 02:00 UTC next day): slots must be computed from `now` (window `(now − 24 h, now]`), not from a fixed calendar date — test in Task 6.
- Missing `/var/lib/aktau-sync/runs` on the first day after rollout, or a truncated/hand-edited run file: report still sends, slots show «прогон не найден» — test in Task 6.
- Operator re-runs sync by hand inside a slot hour: the latest run started in `[slot, slot + 1 h)` wins — test in Task 6.
- Report runs before the monitor release is upgraded, so `state.json` is still v1 with `manualReconciliation`: report must read it (via the shared parser) and show the undelivered event — test in Task 6.
- Monitor phase INCIDENT or DEGRADED at report time with an empty queue: the monitor line is ⚠️, not ✅ (an API that is down right now must not look green; this refines the spec's freshness/queue rule) — test in Task 6.

---

### Task 1: Monitor state v2 with v1 upgrade

**Files:**
- Modify: `scripts/ops/monitor-state.mjs`
- Create: `scripts/ops/monitor-state.test.mjs`
- Modify: `scripts/ci/run-checks.mjs` (append `'scripts/ops/monitor-state.test.mjs'` to the `ops` list)

**Interfaces:**
- Produces:
  - `validateState(s: object): object` — accepts v2 only, throws `Error('state_invalid')`.
  - `upgradeState(s: object): object` — v1 (validated with the current v1 rules) → v2; v2 passes through `validateState`.
  - `parseStateText(text: string): object` — JSON parse, canonical check against the file's own version (`JSON.stringify(parsed) + '\n'`, else `Error('state_noncanonical')`), returns v2.
  - `openState(directory)` — unchanged contract; initial value `{version:2, phase:'OK', failures:0, lastUTC:null, queue:[]}`; reads via `parseStateText`; `save()` writes v2 only.
  - Queue item: `{id: /^[a-f0-9]{32}$/, type: 'incident_opened'|'incident_recovered', atUTC: int ms, attempts: int ≥ 0}`.

- [ ] **Step 1: Write failing tests in `monitor-state.test.mjs`**

```js
const v1Latched = {version:1,phase:'INCIDENT',failures:2,lastUTC:1792869347441,
  pending:{id:'a'.repeat(32),type:'incident_opened',atUTC:1792869347441,nextAttemptUTC:1792869407441,attempts:1,manualReconciliation:true}};
test('v1 latched pending upgrades to a one-item queue', () => assert.deepEqual(upgradeState(v1Latched),
  {version:2,phase:'INCIDENT',failures:2,lastUTC:1792869347441,queue:[{id:'a'.repeat(32),type:'incident_opened',atUTC:1792869347441,attempts:1}]}));
test('v1 without pending upgrades to an empty queue', ...);           // {version:1,phase:'OK',failures:0,lastUTC:null,pending:null} → queue []
test('v2 rejects non-alternating queue', ...);                          // [opened, opened] → /state_invalid/
test('v2 rejects last opened with phase OK', ...);
test('v2 rejects last recovered with phase INCIDENT', ...);
test('v2 rejects 11 items', ...);
test('v2 rejects atUTC above lastUTC and decreasing atUTC', ...);
test('v2 rejects non-empty queue with lastUTC null', ...);
test('parseStateText rejects noncanonical v2 (extra spaces)', ...);    // /state_noncanonical/
test('openState reads a v1 file and saves canonical v2', t => { /* tmp dir 0700, write JSON.stringify(v1Latched)+'\n' mode 0600,
  open → value.version===2; save(value); close; file === JSON.stringify(value)+'\n' and contains "queue" not "pending" */ });
```

- [ ] **Step 2: Run** `node C:/Development/AdilBaga-local-ci/run-local.mjs ops` — Expected: FAIL (`upgradeState` not exported), plus existing failures are acceptable only in this new file.

- [ ] **Step 3: Implement** in `monitor-state.mjs`: keep the current v1 validator as private `validateV1`; add `validateState` (v2 rules from the spec, «Состояние v2»), `upgradeState`, `parseStateText`; switch `openState` to them. Item `attempts` upper bound 1 000 000.

- [ ] **Step 4: Run** the same command — Expected: `monitor-state.test.mjs` PASS (monitor/lifecycle suites may fail until Tasks 3–4).

- [ ] **Step 5: Commit** `feat(ops): monitor state v2 with ordered delivery queue`

---

### Task 2: Telegram text with event tag and generic sender

**Files:**
- Modify: `scripts/ops/telegram-notifier.mjs`
- Modify: `scripts/ops/telegram-notifier.test.mjs`

**Interfaces:**
- Produces:
  - `formatEventText(event: {id, type, atUTC, attempts}): string`
  - `createTelegramSender(config: {token, admin}, {request = https.request, timeoutMs = 10000} = {}): (text: string, signal?) => Promise<boolean>` — text 1..4096 chars else `false` without a request; same response checks as today; `timeoutMs` 1..10000 else `Error('telegram_configuration')`.
  - `createTelegramNotifier(config, opts)` — `(event, signal) => Promise<boolean>`, validates event (`attempts` integer ≥ 1), sends `formatEventText(event)` through `createTelegramSender`.
  - `isTelegramNotifier` is removed (Task 3 drops its only use).

- [ ] **Step 1: Update/add tests**

```js
const event = { type:'incident_opened', atUTC:100000, id:'a'.repeat(32), attempts:1 };
test('ALERT text with tag, seconds precision', () => assert.equal(formatEventText(event),
  'ALERT — Aktau Market Go API\nСервис недоступен\nUTC 1970-01-01T00:01:40Z · событие #aaaa'));
test('retry is marked on the first line', () => assert.equal(formatEventText({...event, attempts:3}).split('\n')[0],
  'ALERT — Aktau Market Go API (повтор, попытка 3)'));
test('RECOVERED text', () => assert.equal(formatEventText({...event, type:'incident_recovered'}),
  'RECOVERED — Aktau Market Go API\nРабота восстановлена\nUTC 1970-01-01T00:01:40Z · событие #aaaa'));
test('sender rejects empty and 4097-char text without a request', ...);
test('sender default timeout is 10000 ms and 10001 is rejected', ...);
```
In the existing transport matrix change the text assertion to the exact string above and keep `assert.ok(!body.includes(event.id))`.

- [ ] **Step 2: Run** `run-local.mjs ops` — Expected: FAIL in `telegram-notifier.test.mjs`.
- [ ] **Step 3: Implement** per Interfaces; ISO time = `new Date(atUTC).toISOString().replace(/\.\d{3}Z$/, 'Z')`, tag = `id.slice(0, 4)`.
- [ ] **Step 4: Run** — Expected: `telegram-notifier.test.mjs` PASS.
- [ ] **Step 5: Commit** `feat(ops): tag Telegram alerts and mark retries`

---

### Task 3: Monitor run with queue and retries

**Files:**
- Modify: `scripts/ops/monitor-go-production.mjs`
- Modify: `scripts/ops/monitor-go-production.test.mjs`

**Interfaces:**
- Consumes: Task 1 state shape; Task 2 `createTelegramNotifier`.
- Produces:
  - `runMonitor({directory, check, notify, now, storeFactory, signal})` → `{outcome: 'OK'|'DEGRADED'|'INCIDENT'|'RECOVERED', reason: 'probe_complete'|'probe_unavailable', queued: number}` or `{outcome:'BLOCKED', reason}` (reasons unchanged: `delivery_not_configured`, `cancelled`, `clock_discontinuity`, `state_unavailable`).
  - `trimQueue(queue: object[]): object[]` (exported, pure) — overflow rule from the spec, limit 10.
  - `notify(event: {id,type,atUTC,attempts}, signal) => Promise<boolean>` for both Telegram and HTTPS.
  - `createNotifier` default `timeoutMs = 10000`, bound 1..10000.
  - `main` exit codes: 0 OK/RECOVERED, 1 DEGRADED/INCIDENT, 2 BLOCKED.

- [ ] **Step 1: Replace the tests** `pending delivery survives restart, cooldown…` and `three failed sends stop…` and adapt the rest:

```js
test('undelivered ALERT keeps probing and arrives before RECOVERED', async t => {
  const f = fixture(t); f.failing(true); let probes = 0; const good = () => { probes++; return healthy() };
  assert.equal((await f.run(bad)).outcome, 'DEGRADED');
  assert.deepEqual(await f.run(bad), { outcome:'INCIDENT', reason:'probe_unavailable', queued:1 });
  assert.deepEqual(await f.run(good), { outcome:'RECOVERED', reason:'probe_complete', queued:2 }); assert.equal(probes, 1);
  f.failing(false);
  assert.deepEqual(await f.run(good), { outcome:'OK', reason:'probe_complete', queued:0 });
  assert.deepEqual(f.sends.map(x => [x.type, x.attempts]),
    [['incident_opened',1],['incident_opened',2],['incident_opened',3],['incident_recovered',1]]);
  assert.equal(new Set(f.sends.slice(0,3).map(x => x.id)).size, 1);
});
test('at most two sends per run, oldest first', ...);   // queue [o1,r1,o2] → next run sends o1,r1 (queued 1), then o2 (queued 0)
test('trimQueue drops a leading recovered alone, else the oldest pair', ...);
  // 11 items starting with opened → length 9, first id = items[2].id; 11 starting with recovered → length 10, first = items[1]
test('attempt is persisted before send', ...);          // adapt existing test at line 110: state.json queue[0].attempts === 1 inside notify
```
In `reject unsafe state:` rename kind `'pending'` to `'queue'` (writes a v2 state with `[opened, opened]`). Remove every expectation of `PENDING`, `delivery_cooldown`, `delivery_exhausted`, `pending_delivered`. CLI exit-code test: INCIDENT → 1.

- [ ] **Step 2: Run** `run-local.mjs ops` — Expected: FAIL in `monitor-go-production.test.mjs`.
- [ ] **Step 3: Implement** the run algorithm from the spec («Прогон»): probe always (except clock discontinuity) → phase → enqueue transition → `trimQueue` → save → up to 2 sends from the head, each preceded by `attempts++` + save, success → shift + save, failure → stop. `queued` = queue length after sending. Drop `isTelegramNotifier`, `nextAttemptUTC`, `manualReconciliation`.
- [ ] **Step 4: Run** — Expected: `monitor-go-production.test.mjs` PASS.
- [ ] **Step 5: Commit** `feat(ops): retry undelivered monitor alerts in order`

---

### Task 4: Real-TLS lifecycle tests for the new delivery policy

**Files:**
- Modify: `scripts/ops/telegram-lifecycle.test.mjs`
- Modify: `scripts/ops/monitor-lifecycle.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3 behaviour; no production code changes in this task (if a test exposes a bug, fix it in the Task 3 module and note it in the commit).

- [ ] **Step 1: Rewrite the old-policy tests**
  - Telegram fixture server: read `s.queue[0].attempts >= 1` instead of `s.pending…manualReconciliation`.
  - Replace `Telegram ${mode} requires durable manual reconciliation…` with `Telegram ${mode} is resent on the next run with the retry mark` for `lost`, `reject`: run 1 (mode) → output `queued:1`; run 2 (mode `ok`) → `queued:0`; last receipt text first line ends with `(повтор, попытка 2)`; both receipts (for `lost`) carry the same `#xxxx`.
  - Replace `Telegram actual5000ms timeout after receipt never retries next invocation` with `Telegram 10000 ms timeout is retried next run` (`{timeout:30000}`), mode `hold`.
  - Replace `Telegram reconciliation latch cannot be malformed or unattempted` with `v1 latched state upgrades and is resent`: write `v1Latched`-style state (see Task 1) into the fixture state dir, run healthy → output `{outcome:'RECOVERED',…,queued:0}`, receipts `['ALERT','RECOVERED']`, first one marked `(повтор, попытка 2)`.
  - Delete `switching an already attempted legacy pending event to Telegram never resends`.
  - Keep `Telegram crash after accepted send retains lock…` (lock semantics unchanged); rename `zero resend` → `crash lock blocks the next run`.
  - `monitor-lifecycle.test.mjs`: `non2xx exhaustion stops probes/delivery…` → `non2xx keeps probing and retries every run`; `real TLS timeout is ambiguous acceptance…` → `TLS timeout is retried next run with the same Idempotency-Key` (receiver dedup count 1); keep `lost reply AFTER durable acceptance…` with updated wording.
- [ ] **Step 2: Run** `run-local.mjs ops` — Expected: all ops suites PASS.
- [ ] **Step 3: Commit** `test(ops): lifecycle coverage for queued alert retries`

---

### Task 5: Sync run files

**Files:**
- Modify: `pipeline/scripts/daily-sync.sh`, `pipeline/scripts/weekly-full-scrape.sh`
- Modify: `ops/sync/aktau-sync.service`, `ops/sync/aktau-sync-full.service` (add `Environment=RUN_STATUS_DIR=/var/lib/aktau-sync/runs`)
- Modify: `scripts/ops/daily-sync.test.mjs`, `pipeline/test/weekly-full-scrape.test.ts`

**Interfaces:**
- Produces (consumed by Task 6): files `<kind>-<YYYYMMDDTHHMMSSZ>.json`, mode 0644, exact shapes from the spec («Часть 2»). Daily keys in order: `version, kind, startedAt, finishedAt, status, exitCode, published, stores{dina,dana,fixprice,anvar}, stale, retention`. Weekly: `version, kind, startedAt, finishedAt, status, exitCode, published(false), stores{dina,dana,fixprice}, scopeFailed`. Timestamps `date -u +%Y-%m-%dT%H:%M:%SZ`. `stale` = failed stores when `published` is true, else `[]`.

- [ ] **Step 1: Extend tests**
  - `daily-sync.test.mjs`: for every row of the existing matrix also set `RUN_STATUS_DIR` to a fresh tmp dir and assert the single file: `success` → `{status:'finished',exitCode:0,published:true,stores:{dina:0,dana:0,fixprice:0,anvar:0},stale:[],retention:'skipped'}`; `stale` → `exitCode:3, stores.dana:1, stale:['dana']`; `all-failed` → `exitCode:1, published:false, stale:[], retention:null`; `apply-failed` → `exitCode:1, published:false, retention:null`; `prune-failed` → `exitCode:4, retention:'failed'`; `prune-success` → `retention:'ok'`. Plus: `no RUN_STATUS_DIR writes no files` (assert the default tmp listing unchanged), `keeps the newest 60 files` (pre-create 65 `daily-2026…Z.json`), `killed run leaves status running` (fake `pnpm` sleeps 5 s, spawn detached, wait until the file shows `"status":"running"`, `process.kill(-pid,'SIGKILL')`, file still `running` with `finishedAt:null`).
  - `weekly-full-scrape.test.ts`: success → `stores {dina:0,dana:0,fixprice:0}, scopeFailed:[], exitCode:0`; `scope:dana` fails → `scopeFailed:['scope:dana'], exitCode:1`; `scrape:dina` fails → `stores.dina:1, exitCode:1`.
- [ ] **Step 2: Run** `run-local.mjs ops,pipeline` — Expected: FAIL on the new assertions.
- [ ] **Step 3: Implement**: `mkdir -p -m 0755 "$RUN_STATUS_DIR"`, then the start file written right after `STORES`/`started` are set (status `running`); a store with no `.code` file yet is `null` in `stores`; each scraper subshell also writes its code to `$tmp/<store>.code` (`mktemp -d`, removed in the trap); `trap 'write_final $?' EXIT` builds the final JSON with `printf`, writes `$dir/.tmp-<name>` then `mv`; `published=true` only after `-apply` succeeds; `retention` set by the prune branch; cleanup `ls -1t "$RUN_STATUS_DIR"/daily-*.json "$RUN_STATUS_DIR"/weekly-*.json 2>/dev/null | tail -n +61 | xargs -r rm -f`. All of this is a no-op when `RUN_STATUS_DIR` is empty. Exit codes unchanged.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sync): write a status file per sync run`

---

### Task 6: Daily report script

**Files:**
- Create: `scripts/ops/sync-report.mjs`, `scripts/ops/sync-report.test.mjs`
- Modify: `scripts/ci/run-checks.mjs` (append `'scripts/ops/sync-report.test.mjs'`)

**Interfaces:**
- Consumes: Task 1 `parseStateText`; Task 2 `createTelegramSender`; Task 5 file shapes.
- Produces:
  - `parseRunFile(text: string): object|null` — `null` for invalid JSON/shape.
  - `expectedSlots(now: number): {kind:'daily'|'weekly', slotUTC:number}[]` — daily 01:00/13:00 UTC and weekly Sunday 22:00 UTC slots inside `(now − 24 h, now]`, oldest first.
  - `pickRun(slot, runs): object|undefined` — same kind, `startedAt ∈ [slotUTC, slotUTC + 3600000)`, latest wins.
  - `buildReport({now: number, runs: object[], monitorState: object|null}): string`
  - `sendReport(text, {send, attempts = 3, pauseMs = 30000, sleep}): Promise<boolean>`
  - `main(args, env, deps)` — no args / `--offline` → `{"outcome":"OFFLINE"}` and no I/O; `--run` reads `/var/lib/aktau-sync/runs/*.json` and `/var/lib/aktau-monitor/state/state.json` (paths overridable only through `deps` for tests), output `{"outcome":"SENT"|"FAILED"|"BLOCKED","reason":…, "lines":n}`; exit 0/1/2. Missing Telegram config → BLOCKED `delivery_not_configured`.

Line copy (exact; times are Aktau `HH:MM`, slot time for runs, `lastUTC` for the monitor):

| Case | Line |
| --- | --- |
| daily code 0 | `✅ 06:00 — опубликовано, 4/4 сети` |
| daily code 3 | `⚠️ 06:00 — опубликовано, dana из прошлого файла (скрапер упал)` (stale joined with `, `) |
| daily code 4 | `⚠️ 06:00 — опубликовано, сбой очистки старых snapshot (код 4)` |
| daily code 1, all four stores ≠ 0 | `❌ 18:00 — не опубликовано: все скраперы упали (код 1)` |
| daily code 1 otherwise | `❌ 18:00 — не опубликовано: сбой публикации (код 1)` |
| daily other non-zero | `❌ 18:00 — не опубликовано (код N)` |
| running, started ≥ 25 min ago | `❌ 18:00 — не завершился` |
| running, younger | `⏳ 18:00 — ещё идёт` |
| no file | `❌ 18:00 — прогон не найден` |
| weekly ok / failed / missing / stuck | `✅ Полный скрап (вс 22:00 UTC): 3/3 сети` / `❌ Полный скрап (вс 22:00 UTC): упали dana, scope:dina` / `❌ Полный скрап (вс 22:00 UTC): не найден` / `❌ Полный скрап (вс 22:00 UTC): не завершился` |
| monitor fresh, queue 0, phase OK | `✅ Монитор API: OK, проверка в 18:27` |
| queue n > 0 | `⚠️ Монитор API: n неотправленн(ая/ые/ых) тревог(а/и/), проверка в 18:27` (`1 неотправленная тревога`, `2 неотправленные тревоги`, `5 неотправленных тревог`) |
| `lastUTC` older than 15 min | `⚠️ Монитор API: не запускался с 17:40` |
| phase DEGRADED/INCIDENT, fresh, queue 0 | `⚠️ Монитор API: INCIDENT, проверка в 18:27` |
| state null | `❌ Монитор API: состояние не прочитано` |

Header `Отчёт Aktau Market · <D> <month genitive>` (Aktau date of `now`), then slot lines in `expectedSlots` order, then the monitor line.

- [ ] **Step 1: Write failing tests** — exact multi-line strings for the two spec examples (`now = Date.UTC(2026,10,10,13,30)` Tuesday; `now = Date.UTC(2026,10,16,13,30)` Monday with weekly), one test per table row, and the Review Focus cases:
  - `late report next day uses slots relative to now` — `now = Date.UTC(2026,10,11,2,0)` → slots 13:00 (Nov 10) and 01:00 (Nov 11).
  - `missing runs dir and invalid file still produce a report` — `main` with an empty/nonexistent dir and one `{"version":1` file → SENT, every slot «прогон не найден».
  - `manual rerun inside the slot hour wins` — two daily files 13:00:01Z (code 1) and 13:20:00Z (code 0) → ✅ line.
  - `v1 latched monitor state is read` — `monitorState` from `parseStateText(JSON.stringify(v1Latched)+'\n')` → `⚠️ Монитор API: 1 неотправленная тревога, …`.
  - `phase INCIDENT with empty queue is a warning` (table row).
  - `sendReport retries three times 30 s apart then fails` — fake `sleep` records `[30000, 30000]`, returns false; succeeds on attempt 2 → true with one sleep.
- [ ] **Step 2: Run** `run-local.mjs ops` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** per Interfaces; month names `января … декабря`; plural by the standard Russian rule (n%10==1 && n%100!=11 → singular; 2–4 excluding 12–14 → paucal; else plural).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ops): daily Telegram report of sync runs and monitor health`

---

### Task 7: Units and renderer

**Files:**
- Modify: `ops/monitor/systemd/aktau-go-monitor.service` (`ExecStart=@NODE24@ --network-family-autoselection-attempt-timeout=2000 @SOURCE_DIR@/scripts/ops/monitor-go-production.mjs --run`, `TimeoutStartSec=90s`)
- Create: `ops/monitor/systemd/aktau-sync-report.service`, `ops/monitor/systemd/aktau-sync-report.timer`
- Modify: `scripts/ops/render-monitor-units.mjs` (`names` = four files; output reports `"files":4`)
- Modify: `scripts/ops/monitor-lifecycle.test.mjs`, `scripts/ops/telegram-lifecycle.test.mjs` (render/verify tests)

`aktau-sync-report.service`: same header comment, `[Unit]` Description `Aktau Market daily sync report`, `Wants/After=network-online.target`; `[Service]` `Type=oneshot`, `User=@MONITOR_USER@`, `WorkingDirectory=@SOURCE_DIR@`, `EnvironmentFile=@ENV_FILE@`, `ExecStart=@NODE24@ --network-family-autoselection-attempt-timeout=2000 @SOURCE_DIR@/scripts/ops/sync-report.mjs --run`, `TimeoutStartSec=150s`, `TimeoutStopSec=5s`, `Restart=no`, and the monitor's sandbox lines except `ReadWritePaths` and `SuccessExitStatus`. Timer: `OnCalendar=*-*-* 13:30:00 UTC`, `Persistent=true`, `Unit=aktau-sync-report.service`, `[Install] WantedBy=timers.target`.

- [ ] **Step 1: Update tests** — render test expects four files; `systemd-analyze verify` over all four; assert the monitor service contains `--network-family-autoselection-attempt-timeout=2000` and `TimeoutStartSec=90s`, the report service has no `ReadWritePaths`, the timer has `OnCalendar=*-*-* 13:30:00 UTC`.
- [ ] **Step 2: Run** `run-local.mjs ops` — Expected: FAIL.
- [ ] **Step 3: Implement** templates and renderer change.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ops): report unit and monitor network flag in templates`

---

### Task 8: Documentation and full local CI

**Files:**
- Modify: `ops/monitor/README.md` — title/status (active on VPS since 2026-10-20, Telegram delivery), replace «Receipt/retry limitations and reconciliation» and the max-3/cooldown/manual-reconciliation text with the queue policy, add «Ежедневный отчёт» (units, schedule, what it reads, manual one-shot `sudo systemctl start aktau-sync-report.service`), rollout steps 3–4 and rollback from the spec.
- Modify: `ops/sync/README.md` — section «Файлы прогонов» (path, shape, retention 60, `RUN_STATUS_DIR`); replace the `git fetch https://github.com/...` update with the bundle procedure (repository is private).
- Modify: `docs/production/OBSERVABILITY_ALERT_POLICY.md` — delivery is configured (Telegram), retry policy, daily report as the detection path for a silent monitor.

- [ ] **Step 1: Edit the three documents** (Russian, matching each file's current language; no SHA of the active API release copied into them).
- [ ] **Step 2: Run** `node C:/Development/AdilBaga-local-ci/run-local.mjs ops,pipeline,security` — Expected: exit 0.
- [ ] **Step 3: Commit** `docs(ops): monitor queue policy, daily report and sync run files`

VPS rollout is not part of this plan's execution: after merge, follow the spec's «Выкатка на VPS»; commands are prepared for the user then.
