# VPS status in one command

`adilbaga_status.py` prints the state of the production VPS on one screen, so a check
is one paste instead of a dozen commands. It is read-only: it starts, stops and writes
nothing, and it never reads secret files (`api.env`, `aktau-sync.env`, `telegram.env`).

Sections:

| Section | What it shows | Warns when |
| --- | --- | --- |
| API | `release.env` tag vs running container, health, restarts, kept images, `/health/live`, `/health/ready`, published `snapshotAt` from `/api/dashboard` | image differs from `release.env`, not running/healthy, restarts > 0, health not 200, snapshot older than 13 h |
| Services and timers | `docker`, `cloudflared`; timers `aktau-sync`, `aktau-sync-full`, `aktau-go-monitor`, `aktau-sync-report` with last/next run and last service result | service not active, timer not active, service result not `success` |
| Sync | last 4 run files from `/var/lib/aktau-sync/runs`, snapshot count from the last `retention_complete` journal line, `/opt/aktau-sync` checkout, VPS Go version | last daily exit ≠ 0, stuck > 25 min, no daily for 13 h, retention failed or missing, checkout has changed files |
| Monitor | `state.json`: phase, failures, last run, queue; last journal line | phase ≠ OK, undelivered alerts, no run for 15 min |
| Host | uptime, load, available memory, disk `/` and `/var/lib/docker`, reboot flag | disk ≥ 85 %, reboot required |

Lines starting with `! ` are warnings; they are repeated under `== Warnings` at the end.
The last line is `RESULT=OK` (exit 0) or `RESULT=WARN n=<count>` (exit 1).
A section that fails is reported as a warning and the other sections still run.
Python stdlib only.

## Install on the VPS (once, and after each change)

Copy the file from a reviewed checkout of `main` (as `b2admin`, from the workstation):

```bash
scp ops/status/adilbaga_status.py b2admin-vps:/tmp/adilbaga_status.py
```

On the VPS:

```bash
sudo install -o root -g root -m 0755 /tmp/adilbaga_status.py /usr/local/sbin/adilbaga-status && rm /tmp/adilbaga_status.py
```

## Run

```bash
sudo python3 -I -B /usr/local/sbin/adilbaga-status
```

Use it before and after a release, after an incident alert, and for routine checks.
It needs root: `release.env`, the monitor state and system journals are root-only.

Tests: `python3 -B -m unittest discover -s ops/status -p '*_test.py'`
(part of `run-checks.mjs security`).
