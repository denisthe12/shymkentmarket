# Go operator monitor — ACTIVE on the production VPS (Telegram delivery)

**Status.** The monitor has been running on the production VPS since 2026-10-20:
`aktau-go-monitor.timer` fires every 5 minutes, delivery is Telegram, state is in
`/var/lib/aktau-monitor/state`, release source in
`/opt/aktau-monitor/releases/<sha>`, secrets in `/etc/aktau-monitor/telegram.env`.
The unit runs as a dedicated **non-root** user on Node24. The API, ingestion and
Frontend are not modified. This is not a public metrics endpoint.

**Incident 2026-10-24 .. 2026-11-09.** One Telegram send timed out; the old
"one attempt, then manual reconciliation" policy latched the state (`PENDING /
delivery_reconciliation_required`, no probes) and `SuccessExitStatus=1` made every
run look successful. The monitor was silently stuck for 16 days until it was
unlocked by hand on 2026-11-09. The queue policy below removes the latch, and the
daily report's monitor line (see "Daily sync report") is the detection path for a
silent monitor.

Sections "Part21 activation permission packet" and "Part22 — direct Telegram"
below are the historical activation procedure, kept as the reference for a
reinstall; they no longer describe a pending activation.

## Offline now

From the repository root (no private configuration needed):

```bash
rtk proxy node scripts/ops/monitor-go-production.mjs --offline
rtk proxy node scripts/ops/check-go-release.mjs --offline
rtk proxy node --test scripts/ops/monitor-go-production.test.mjs scripts/ops/check-go-release.test.mjs
```

Default monitor/checker execution is offline, no state/network/delivery I/O.
Tests own disposable private state and loopback services; transport mocks never
contact production or a real receiver. Part21 adds real loopback TLS handshakes,
ephemeral private certificates and independent monitoring processes; production
TLS verification is unchanged. This is not real notification delivery evidence.

## Legacy HTTPS delivery (fallback, `AKTAU_MONITOR_DELIVERY=https` or unset)

Production uses Telegram (Part22 below). The HTTPS receiver mode is retained as
a fallback and follows the same queue rules as Telegram, with `Idempotency-Key`
= the event `id` and a 10 s request timeout. It needs one private HTTPS receiver
that authenticates the bearer token and durably deduplicates `Idempotency-Key`.
A2xx is receiver acceptance, **not** a human receipt or downstream delivery
guarantee. Provide values by a root-managed private environment injection into the
dedicated non-root process. Do not put values into Git, reports, argv, shell
history, browser/client env or CI. Do not read real credentials just to test.

In HTTPS mode these private process variables are consumed by explicit `--run`:

- `AKTAU_MONITOR_STATE_DIR`: normalized absolute directory outside source,
  Git/artifacts/dependencies, owned by the effective operator UID, mode0700.
  The CLI does not mkdir/chown/chmod.
- `AKTAU_MONITOR_RECEIVER_URL`: one exact canonical HTTPS URL, no userinfo/query/
  fragment, max2048chars, no redirects. Do not point it at any unrelated internal API.
- `AKTAU_MONITOR_RECEIVER_TOKEN`:16–512 ASCII token characters from the documented
  token alphabet (letters/digits/dot/underscore/tilde/plus/slash/hyphen).
  Missing/invalid config blocks before state creation/probes.

Manual one-shot (as the monitor user, with the environment injected):

```bash
rtk proxy node scripts/ops/monitor-go-production.mjs --run
```

One invocation uses the existing Part19 verifier unchanged: at most5 sequential
fixed unauthenticated Go GETs,8s/request,50s shared, bounded bodies, no retries/
redirects. Then at most 2 queued events are sent (see below), each with a 10 s
absolute timeout, fixed POST headers/payload, verified TLS, no proxy agent/cookies/
redirects/retry or response-body logging. No Voice, HMAC, Redis, DB, publication or
other endpoints. No loop is hidden in imports/default mode; the cadence comes from
the systemd timer.

## State and alert queue policy

State is `state.json` v2:
`{"version":2,"phase":"OK","failures":0,"lastUTC":<ms>,"queue":[...]}`. A queue
item is `{"id":"<32 hex>","type":"incident_opened"|"incident_recovered","atUTC":<ms>,"attempts":<n>}`.
The queue holds undelivered events in order of occurrence, at most 10. A v1 file
(`pending: null` or one `pending` item) is upgraded to v2 on the first read
(`nextAttemptUTC` and `manualReconciliation` are dropped); every write is v2.

Every run (timer, every 5 minutes) does the following:

1. **Probe always.** The Part19 verifier runs regardless of the queue (except
   `clock_discontinuity`). Health monitoring never pauses for a delivery outage.
2. **Phase update.**

| Previous state / observation | New state / action |
| --- | --- |
| Any non-incident / complete healthy verifier | OK, reset consecutive failures |
| OK / unsuccessful verifier | DEGRADED, failures1, no event |
| DEGRADED / next unsuccessful verifier | INCIDENT, failures2, append `incident_opened` to the queue |
| INCIDENT / unsuccessful verifier | INCIDENT, saturated count2, no repeated event |
| INCIDENT / successful verifier | OK, append `incident_recovered` to the queue; output RECOVERED |

3. **Overflow (> 10).** If the queue starts with `incident_recovered` (its ALERT
   was already delivered) only that item is dropped; otherwise the first two items
   (an `incident_opened` + `incident_recovered` pair) are dropped. Repeated until
   the length is ≤ 10.
4. **Save** the state.
5. **Send up to 2 events per run from the head of the queue**, so ALERT always
   arrives before RECOVERED. Before each send `attempts` is incremented and saved.
   On confirmed success the event is removed and saved, then the next one is sent.
   On failure the run stops sending and the event stays at the head until the next
   run. There is **no retry limit, cooldown or manual reconciliation**: delivery is
   retried every run until Telegram confirms.

Healthy requires the complete5-check successful Part19 result, not a partial
PASS/status string. WAF/transport/schema errors are unsuccessful; no raw error
is persisted. Zero-success-ever can open an incident after two failed polls.
No `snapshotAt`/product/body data retained or freshness/publish SLA inferred.
Counts are poll-based, not a guessed cadence.

**Duplicates are accepted.** Telegram has no idempotency key and the bot cannot
read its own messages. A lost reply, or a crash after `attempts++` but before the
ack, causes a re-send. To make that visible every Telegram text ends with
`· событие #xxxx` (first 4 hex of the event `id`), and from the second attempt the
first line gets ` (повтор, попытка N)`. A retried send is the same event, not a
new incident.

Every invocation is serialized by exclusive0600 `monitor.lock`. State is a
bounded canonical JSON `state.json`, mode0600; directory/ancestor UID/mode/type/
symlink checks and anchored directory fd protect custody. Root-sticky ancestors
such as `/tmp` are allowed for owned test directories, not for production state.
Each save writes an exclusive0600 pending file fully, fsyncs it, renames and
fsyncs the directory. Faults leave the lock/pending interlock and block future
runs. Concurrent invocations never check/send. No stale-lock-by-age/PID removal.
Wall clock rollback blocks before probes/delivery (`clock_discontinuity`).

Output: `{"outcome":"OK"|"DEGRADED"|"INCIDENT"|"RECOVERED","reason":"probe_complete"|"probe_unavailable","queued":<n>}`
or `BLOCKED` with a fixed reason. `RECOVERED` is printed in the run that records
the recovery, independent of delivery. The old `PENDING`/`DELIVERED` outcomes and
the `delivery_reconciliation_required` reason no longer exist. Exit0: OK/RECOVERED;
exit1: DEGRADED/INCIDENT; exit2: arguments/config/state/clock/cancellation BLOCKED.
`SuccessExitStatus=1` stays, so exit1 or a non-zero `queued` is visible only in
the journal output and in the daily report, not as a failed unit.

Event body has type, UTC timestamp, fixed category `go_api_unavailable`; the
generated event ID is only a label/idempotency header. No URL, token, API IDs,
headers, body, product/store, search/voice or coordinates output.

## Recovery / reset (manual, no reset switch)

There is no latch to clear. A queue that cannot drain (Telegram or network down)
needs no operator action: events stay ordered and drain once delivery works.

1. A stuck `monitor.lock`/pending file after a crash: prove no invocation is
   active (not merely an old lock timestamp), retain the files for review, and
   remove nothing automatically.
2. Corrupt or interrupted storage: compare current and pending records. Owner
   approves any repair with the exact event identity; preserve quarantined
   originals outside Git. Do not select a healthy state blindly. If no reliable
   record exists, report monitoring/delivery NOT_VERIFIED and keep the interlock.
3. An intentional new monitoring lifetime needs a separately approved fresh
   private0700 directory. It resets poll history and can create another incident.
4. Never print private state/token/URL into shared logs.

## Daily sync report

`scripts/ops/sync-report.mjs` sends one Telegram message per day with the result of
the sync runs and a line about the monitor itself.

- Units: `aktau-sync-report.service` (oneshot, monitor user,
  `EnvironmentFile=@ENV_FILE@`, same sandbox as the monitor but without
  `ReadWritePaths`, Node flag 2000 ms, `TimeoutStartSec=150s`) and
  `aktau-sync-report.timer` (`OnCalendar=*-*-* 13:30:00 UTC` = 18:30 Aktau,
  `Persistent=true`). The renderer produces four units (monitor service/timer,
  report service/timer).
- Reads, read-only: `/var/lib/aktau-sync/runs/*.json` (see `ops/sync/README.md`)
  and `/var/lib/aktau-monitor/state/state.json` (validated directly, v1 or v2,
  without taking `monitor.lock`).
- Window `[now − 24 h, now]`. Expected daily runs start within one hour after the
  01:00 and 13:00 UTC slots; the weekly full scrape is expected from Sunday 22:00 UTC.
- One line per run, times in Aktau (UTC+5): ✅ code 0; ⚠️ code 3 (stale networks
  named) or code 4 (retention failed); ❌ code 1 or other non-zero, a run that is
  `running` for ≥ 25 minutes ("не завершился"), or no file ("прогон не найден");
  ⏳ a recent `running` run. Weekly line: ✅ code 0, ❌ with the failed
  networks/scope steps, or not found.
- Monitor line: ✅ `lastUTC` within 15 minutes, empty queue, phase OK; ⚠️ unsent
  alerts in the queue (count), `lastUTC` older than 15 minutes, or phase
  DEGRADED/INCIDENT; ❌ `state.json` missing or unreadable.
- Sending: up to 3 attempts 30 s apart, 10 s each, no queue and no event label.
  All failed: exit 1, journal `{"outcome":"FAILED","reason":"delivery_failed"}`.
  Journal lines carry only `outcome`/`reason`/`lines`, never the report text or token.
- **Telegram only.** The unit's `@ENV_FILE@` must be `/etc/aktau-monitor/telegram.env`:
  render with `telegram` delivery. Rendered with `https` delivery the report ends
  `BLOCKED delivery_not_configured` (no `BOT_TOKEN`/`ADMIN_ID`).
- **A missing report at 18:30 Aktau is itself the alarm**: the report runs on the
  same VPS as the monitor, so a dead VPS sends neither. A silent monitor shows up
  as ⚠️/❌ in this report.
- **Known limitation.** The weekly line appears only when Sunday 22:00 UTC falls
  inside the 24-hour window. A Monday catch-up run after 22:00 UTC (the timer is
  `Persistent=true` and fires late after VPS downtime) omits it.

Manual one-shot (sends a real Telegram message):

```bash
sudo systemctl start aktau-sync-report.service
sudo journalctl -u aktau-sync-report.service -n 10 --no-pager -o cat
```

## Rollout and rollback of the queue monitor and report

The repository is **private** (since 2026-11-06): `git fetch https://github.com/...`
on the VPS asks for credentials and must not be used; never put tokens on the VPS.
Code travels as a git bundle built on a workstation:
`git bundle create aktau-<sha7>.bundle <prev-sha>..<new-sha>` (or add a temporary
ref such as `refs/tmp/release`), `scp` it, then on the VPS as `aktau-sync`:
`git -C /opt/aktau-sync fetch /path/aktau-<sha7>.bundle <ref>` and
`checkout --detach <full sha>`.

Order matters: sync starts writing run files first, then the report is installed.

1. Merge to `main`, green CI, bundle to the VPS.
2. Sync: outside run windows update the `/opt/aktau-sync` checkout, replace the two
   units from `ops/sync/`, `daemon-reload`. The first run creates
   `/var/lib/aktau-sync/runs/`.
3. Monitor: create `/opt/aktau-monitor/releases/<sha>` (modules from the git objects
   of the sync checkout, compare hashes), render the four units with
   `render-monitor-units.mjs ... telegram`, `systemd-analyze verify`, install, remove
   the old drop-in `aktau-go-monitor.service.d/10-connect-timeout.conf` (the unit
   now carries `--network-family-autoselection-attempt-timeout=2000` and
   `TimeoutStartSec=90s`), `daemon-reload`. State v1 is upgraded to v2 on the first
   run. A manual `systemctl start aktau-go-monitor.service` must print `OK` with
   `"queued":0`.
4. Report: `sudo systemctl start aktau-sync-report.service`, confirm the Telegram
   message, then `sudo systemctl enable --now aktau-sync-report.timer`.
5. Rollback: monitor — point the unit back to the previous release with its old
   drop-in. **Old monitor code cannot read state v2**: before rolling back restore
   the v1 copy from `/var/lib/aktau-monitor/quarantine/` or reset the state, otherwise
   the old monitor blocks. Sync — checkout the previous SHA and previous units.
   Report — `sudo systemctl disable --now aktau-sync-report.timer`.

**Why the 2000 ms Node flag.** The VPS has no IPv6 route and about 20% of IPv4
connects to Cloudflare need a 1 s SYN retry. Node's default 250 ms per-address
attempt limit caused false probe failures.

## Offline Go release review, not deploy approval

`check-go-release.mjs` consumes the **existing** Part15/auto-build local layout:
manifest.json, image.tar, api, backend-go/Dockerfile and backend-go/go.mod.
The latter two are the existing clean Git-export recipe, not a new manifest format.

```bash
# LOCAL artifacts only; replace placeholders, never use credentials/backup paths.
rtk proxy node scripts/ops/check-go-release.mjs --check /absolute/review/candidate FULL40SHA
# Optional independent local rollback bundle and its different full SHA:
rtk proxy node scripts/ops/check-go-release.mjs --check /absolute/review/candidate FULL40SHA /absolute/review/rollback PREVIOUS40SHA
```

Read-only, fixed filenames/caps, no symlink traversal, strict manifest/duplicate
keys and digest/metadata checks; source recipe compares to existing local Git
objects for the exact supplied SHA, no fetch/build/load. Existing Part15 identity
validator and auto-build artifact-name rules reused. No modifications to artifacts.
No stdout private path/body/error/config. Exit0 local consistency/ordinary offline;
exit1 rejected artifact; exit2 unsupported args. Output bounded matrix only.

**READY_FOR_OWNER_REVIEW means LOCAL CONSISTENCY ONLY; production always BLOCKED.**
The same local manifest claims cannot authenticate Docker archive contents, tag,
actual base/toolchain, hosted CI producer, remote bytes, root approval, broker,
runtime DB/Voice compatibility, rollback compatibility or post-cutover smoke.
Those gates remain NOT_VERIFIED even if artifact JSON says otherwise. Even a
self-consistent synthetic non-image is not authenticated by a checksum. The
checker intentionally does not replace broker tar inventory, sealed-fd custody,
single-use independent authorization or Docker identity verification. No fabricated
IDs, approval files, copy/load/transport or upgrade of a local result to release PASS.

Current healthy438 and historical absent wrapper are dated Part19 observations,
not read again here. Future release requires exact hosted artifact/Owner approval,
appropriate approved release route, compatible preserved rollback, private config
and application Voice gates. Keep AUTO_DEPLOY_ENABLED disabled. 

The mandatory existing Security job runs `node scripts/ci/run-checks.mjs ops`
with Node24: all92 Part20 cases plus the Part21 lifecycle/unit-kit tests. The
original nine CI job names and deployment eligibility contract are unchanged.
OpenSSL and systemd-analyze must already exist on the Linux test runner; tests
do not install them. A broken operator suite fails the job, not a silent skip.

## Part21 activation permission packet (historical reference)

Historical packet: production activation happened on 2026-10-20 with Telegram
(Part22) instead of an HTTPS receiver, so the receiver-specific parts below apply
only to the fallback mode. Treat the commands as the reference for a reinstall or
a new host, to be run only with the Owner's approval. The Owner picks the
dedicated non-root account, root-controlled Node24 executable under `/usr` or
`/opt`, exact reviewed source commit, channel, credential provisioning and cadence.
No provider, account, SSH identity or actual Node path is invented here. No new
SSH/sudo grant is needed by the monitor.

Resources the monitor uses:

| Resource | Future custody / permitted change |
| --- | --- |
| `/opt/aktau-monitor/releases/FULL40SHA` | Root-owned immutable reviewed source; directories0755, runtime modules0644: monitor-go-production, monitor-state, verify-go-production, telegram-notifier and sync-report under scripts/ops |
| `/etc/aktau-monitor/receiver.env` | Root-owned0600; parent0755; private provisioning, never cat/log/copy to artifacts |
| `/var/lib/aktau-monitor/state` | Selected account owns0700, state/lock0600; root-controlled parent0755 |
| `/var/lib/aktau-monitor/acceptance` | Separate fresh0700 test state, same account; never reuse real monitoring state |
| `/etc/aktau-monitor/test-receiver.env` | Optional root0600, only Owner-controlled TEST receiver URL/token; no real incident destination for synthetic tests |
| `/etc/systemd/system/aktau-go-monitor.service` and `.timer` | Root0644 rendered reviewed units; initially disabled |
| `/etc/systemd/system/aktau-sync-report.service` and `.timer` | Root0644 rendered units of the daily report (see "Daily sync report"); enabled only after a manual test message |

Only the three documented AKTAU_MONITOR variables belong in receiver.env. The
state path must be the approved fixed state directory. Systemd reads this file
as manager, then starts the non-root process. Source and Node executable plus
all ancestors must be root-controlled, non-writable by the monitor. Reject
symlinks, shared writable source, unexpected versions/digests or existing
unreconciled state. Do not overwrite an existing unit or private state silently.

The following is a **future private operator command packet, not authorization
to execute it now**. Set non-secret `MONITOR_USER`, `NODE24`, `SOURCE_DIR` and
`RENDER_DIR` to the separately approved values. SOURCE_DIR must end in the full
reviewed40hex commit; NODE24 must be the approved root-controlled executable.
Render as non-root in a fresh local0700 directory outside Git:

```bash
id "$MONITOR_USER"
"$NODE24" --version                         # must be v24.x, reviewed version
stat -c '%U %a %F' "$NODE24" "$SOURCE_DIR"
git show HEAD:scripts/ops/monitor-go-production.mjs | sha256sum
sha256sum "$SOURCE_DIR/scripts/ops/monitor-go-production.mjs"
# Repeat for monitor-state.mjs, verify-go-production.mjs and telegram-notifier.mjs.
"$NODE24" scripts/ops/render-monitor-units.mjs --render "$RENDER_DIR" "$MONITOR_USER" "$NODE24" "$SOURCE_DIR"
systemd-analyze verify "$RENDER_DIR/aktau-go-monitor.service" "$RENDER_DIR/aktau-go-monitor.timer"
```

Owner must verify every ancestor, source digest and exact commit, not only the
shown leaf stat. Confirm receiver DNS/TLS, bearer authentication, durable
idempotency and a private downstream receipt channel independently. Never put
URL/token in the command line. Provision the root-owned env files via the
existing private operator procedure; this kit does not create credentials.
After path/custody validation and approval, Owner may install only the two
rendered0644 units (no account or source changes implicit in these commands):

```bash
sudo install -o root -g root -m 0644 "$RENDER_DIR/aktau-go-monitor.service" /etc/systemd/system/aktau-go-monitor.service
sudo install -o root -g root -m 0644 "$RENDER_DIR/aktau-go-monitor.timer" /etc/systemd/system/aktau-go-monitor.timer
sudo systemd-analyze verify /etc/systemd/system/aktau-go-monitor.service /etc/systemd/system/aktau-go-monitor.timer
sudo systemctl daemon-reload
# Manual one-shot mode: timer stays disabled. Up to5 fixed API GET, <=2 deliveries.
sudo systemctl start aktau-go-monitor.service
sudo journalctl -u aktau-go-monitor.service -n 10 --no-pager -o cat
```

First one-shot must yield complete OK, not pending/blocked; do not manufacture
an outage of the Go API. Inspect only sanitized monitor outcomes. Exit1 is a
completed unhealthy/pending observation, not success evidence or a restart.

Bounded synthetic open/recovery acceptance uses the **test receiver only**,
its separate environment file and fresh acceptance state. This future transient
unit injects test observations into the real monitor; **0 public API requests,
at most2 HTTPS POST, each<=10s, no retries**. No tokens/URLs in argv or output:

```bash
sudo systemd-run --unit=aktau-go-monitor-acceptance --wait --pipe \
  -p "User=$MONITOR_USER" -p "WorkingDirectory=$SOURCE_DIR" \
  -p EnvironmentFile=/etc/aktau-monitor/test-receiver.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes \
  -p ReadWritePaths=/var/lib/aktau-monitor/acceptance -p UMask=0077 \
  -p TimeoutStartSec=20s -p KillMode=control-group \
  "$NODE24" --input-type=module -e '
import {runMonitor,createNotifier} from "./scripts/ops/monitor-go-production.mjs";
const notify=createNotifier({url:process.env.AKTAU_MONITOR_RECEIVER_URL,token:process.env.AKTAU_MONITOR_RECEIVER_TOKEN});
const directory="/var/lib/aktau-monitor/acceptance";
const bad=()=>({outcome:"FAIL"});
const good=()=>({outcome:"PASS",requests:5,records:["live","ready","categories","products","dashboard"].map(endpoint=>({endpoint,outcome:"PASS",schemaClass:"valid",statusClass:"2xx"}))});
for(const [check,expected] of [[bad,"DEGRADED"],[bad,"INCIDENT"],[good,"RECOVERED"]]){
 const result=await runMonitor({directory,check,notify});
 console.log(JSON.stringify(result)); if(result.outcome!==expected)process.exit(2);
}'
```

STOP on any unexpected outcome, missing receipt, TLS/auth failure or leftover
lock. A2xx proves only receiver acceptance. Owner must correlate exactly one
synthetic open and one recovery with independent human/downstream receipt and
durable receiver dedup; never print private event IDs into shared logs. This
manual approval remains required after local tests and CI pass.

Only after these checks and the approved cadence decision, enable the new timer:

```bash
sudo systemctl enable --now aktau-go-monitor.timer
sudo systemctl status aktau-go-monitor.timer --no-pager
# Disable/rollback the monitor scheduler only; preserve private state/evidence.
sudo systemctl disable --now aktau-go-monitor.timer
sudo systemctl stop aktau-go-monitor.service
```

Enable and disable are alternative phases, not one script to run end-to-end.
The candidate timer is5min after inactivity, no catch-up, no overlap, no restart
loop. Service90s includes verifier50s + 2 sends of 10s + storage margin; stop5s kills
the whole group. Never delete crash locks/pending state automatically; follow
the recovery section above. Source rollback needs a separately reviewed
previous immutable source and rerender; no Go image rollback is implied. Go,
Cloudflare, sync timers and AUTO_DEPLOY_ENABLED remain unchanged.

## Part22 — direct Telegram (production delivery)

Telegram is **outbound sendMessage only**; no receiver server, webhook, polling,
getUpdates, commands or callback endpoint is needed. Protocol reference:
[official Bot API sendMessage](https://core.telegram.org/bots/api#sendmessage).
Tests never make Telegram network requests.

Explicit Telegram process environment consists of exactly these four entries:

- `AKTAU_MONITOR_DELIVERY=telegram`
- `BOT_TOKEN` — strict token; never in argv/output/Git/CI or a shared transcript.
- `ADMIN_ID` — positive numeric personal private-chat ID, not a subscriber list.
- `AKTAU_MONITOR_STATE_DIR=/var/lib/aktau-monitor/state`

Root-managed `/etc/aktau-monitor/telegram.env` must be root:root0600, regular,
single-link, under a root-controlled nonsymlink directory. Provision via an
approved private encrypted-stdin procedure only: never source/eval the old
backend dotenv, upload it wholesale, or print values/lengths/hashes. On the
production VPS this file exists and is used by both the monitor and the report.

Unset delivery keeps legacy HTTPS behavior; `https` selects it explicitly.
Unknown delivery or missing Telegram values blocks before state/probes, never
falls back. Default/`--offline` reads no env or state and sends nothing. The
renderer defaults to legacy receiver.env; pass the final literal `telegram` to
select only telegram.env, never both files or an arbitrary env path:

```bash
"$NODE24" scripts/ops/render-monitor-units.mjs --render "$RENDER_DIR" "$MONITOR_USER" "$NODE24" "$SOURCE_DIR" telegram
systemd-analyze verify "$RENDER_DIR/aktau-go-monitor.service" "$RENDER_DIR/aktau-go-monitor.timer"
```

Do not install the raw template, unresolved placeholders or a unit from another
reviewed source. The90s bound, non-root hardening and0700 state apply.
All runtime modules (monitor-go-production, monitor-state, verify-go-production, telegram-notifier and, for the report, sync-report) must match the same reviewed commit; Node24 and source
ancestors must be root-controlled. The existing Part21 packet describes source,
state and unit installation; substitute the explicit Telegram-rendered service,
and do not provision the legacy receiver env for Telegram mode.

### Receipt and retry

Telegram success requires complete HTTP200, bounded valid JSON `ok:true`, positive
message_id and the configured private chat identity when returned. Response body,
chat/message IDs and token-bearing request path are never logged or persisted.
One attempt<=10s,32768-byte response cap, default TLS, no proxy/redirect/retry
inside an attempt. Messages are fixed Russian ALERT/RECOVERED text, service name,
UTC time of the event and the `· событие #xxxx` label; retried sends add
` (повтор, попытка N)` (see "State and alert queue policy").

**Telegram has no durable idempotency key.** Delivery is at-least-once: an
unconfirmed send (429, TLS error, timeout, rejection, lost reply) is simply retried
on later runs until confirmed, and a rare duplicate is accepted. There is no
reconciliation latch; the 2026-10-24 incident is why it was removed. Pre-queue
state files (v1, including ones with `manualReconciliation`) are upgraded
automatically.

SIGTERM/crash can leave the existing lock; no automatic unlock or reset (see
"Recovery / reset"). Never erase state to make green. Rolling back to pre-queue
source cannot read state v2: see the rollback step in "Rollout and rollback".
### Activation checklist (historical; performed for production 2026-10-20)

1. Owner opens the bot and sends `/start` personally. Confirm ADMIN_ID is that
   personal private chat; no webhook/getUpdates or bot command implementation.
2. Root-controlled parent/env staging; verify only metadata/booleans, never file
   contents. An existing secret file must not be overwritten silently.
3. Install the source modules and render/verify units using the reviewed SHA
   and approved non-root account/Node24 path, as in Part21; timer stays disabled.
4. In a scheduled manual smoke slot, send **one known synthetic ALERT** using
   the private manager-injected env below. This is a transport receipt test,
   not a real outage or a monitor-state incident. Verify sanitized ACCEPTED plus
   actual human receipt (API200 alone is not a human read receipt).
5. Run the installed service once: up to5 fixed public GET, up to 2 deliveries;
   require complete OK from the healthy API. Do not sabotage Go to create an incident.
6. Synthetic incident/recovery E2E stays local against the loopback test transport:
   `node --test scripts/ops/telegram-lifecycle.test.mjs`. Never route test fixtures
   to a real bot; the tests intercept every send.
7. Only after receipt and a one-shot PASS enable the timer.

One-message smoke command (no values in argv/history/logs; account/Node/source as
selected by the Owner):

```bash
sudo systemd-run --unit=aktau-monitor-telegram-smoke --wait --pipe \
  -p "User=$MONITOR_USER" -p "WorkingDirectory=$SOURCE_DIR" \
  -p EnvironmentFile=/etc/aktau-monitor/telegram.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes \
  -p TimeoutStartSec=10s -p KillMode=control-group -p LimitCORE=0 \
  "$NODE24" --input-type=module -e '
import {randomBytes} from "node:crypto";
import {createTelegramNotifier} from "./scripts/ops/telegram-notifier.mjs";
try{
 const send=createTelegramNotifier({token:process.env.BOT_TOKEN,admin:process.env.ADMIN_ID});
 const ok=await send({id:randomBytes(16).toString("hex"),type:"incident_opened",atUTC:Date.now()});
 console.log(JSON.stringify({outcome:ok?"ACCEPTED":"RECONCILE_STOP"}));process.exitCode=ok?0:2;
}catch{console.log("{\"outcome\":\"CONFIG_BLOCKED\"}");process.exitCode=2;}'
```

Manual one-shot / enable / disable commands:

```bash
sudo systemctl start aktau-go-monitor.service
sudo journalctl -u aktau-go-monitor.service -n 10 --no-pager -o cat
# Only after receipt and complete one-shot OK:
sudo systemctl enable --now aktau-go-monitor.timer
# Alternative rollback phase: disable this timer only; keep private state.
sudo systemctl disable --now aktau-go-monitor.timer
sudo systemctl stop aktau-go-monitor.service
```

A same-VPS monitor cannot send an alert if the whole VPS/network fails. External
watchdog redundancy remains a later operational improvement, not covered by a
working Telegram adapter; the daily report only turns a missing message into a
human signal.
