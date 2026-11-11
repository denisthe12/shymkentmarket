# Go 1.27.4 production API release — 2026-11-11

**Final status: `MANUAL_DEPLOY_PASS`.** Manual cutover per `deploy/README.md`, not a broker
`DEPLOY_PASS`. Active `a08ff71`, rollback target `1cbd535` (see `deploy/README.md` «Current release»).

Why: PR #108 (`145ac9a`) raised `backend-go/go.mod` and `backend-go/Dockerfile` to Go 1.27.4 for
GO-2026-6859 (net/http HTTP/1 server crash, reachable from `cmd/api`). The running `1cbd535` image
was built with Go 1.27.3.

Operator: Backend 2 typed every VPS command as `b2admin` and approved the cutover; Claude Code
wrote and reviewed the commands and the cutover script and never connected to the VPS.

## Source, CI, artifact

- Release SHA `a08ff7165f9922b1497c26928aad7fa92e55f948` = main head (PR #111 merge). Between
  `ae69e01` (PR #109, first main with Go 1.27.4 everywhere) and `a08ff71` only
  `backend-go/README.md` changed under `backend-go/`; the build gate accepts only the main head.
  Versus `1cbd535`, `backend-go/` differs in Go version and tests only, no API code.
- Exact-main CI run `43019625451`, attempt 1: 9/9 jobs `success`.
- Build-only run `43030294484`, attempt 1 (`IMMUTABLE_BUILD_PASS`; rollout skipped,
  `AUTO_DEPLOY_ENABLED=false`). Artifact `13859044374`
  `adilbaga-api-a08ff7165f9922b1497c26928aad7fa92e55f948-43030294484-1`.
- ZIP SHA-256 `d7cffbaf1db098f7bafbed936eefefdf2b957a60324c162ed4a1d9215244c5d9` (= GitHub
  artifact digest); `image.tar` `1160b9cc283315cb1a235d36441be9356822b9a9113dfe7281c9aed4a6a75759`
  (21 981 184 bytes, = manifest).
- Independently checked on the workstation: revision `a08ff71…`, linux/amd64, `10001:10001`,
  entrypoint `/usr/local/bin/api`; rootfs `75f1d965…`, `474e19a4…`, `c77bac6c…` all equal the
  decoded layers; binary `cbd3a401a28ecf58ea5eccb519c5b2a6e47516443ba3d32dcfa1925a08346fc2`,
  `go version` → **go1.27.4**.

## VPS preflight (read-only, 13:37Z)

`release.env`, container and OCI label `1cbd535…`, healthy, 0 restarts; images `1cbd535` and
`e50de25` present; cloudflared active; `aktau-sync`/`aktau-sync-full` inactive (13:00Z run done,
next 01:00Z); no `*.json` in `/var/lib/adilbaga/deploy/`; broker `7b8f5320…`, smoke `3f7a22c2…`,
compose `7ba6711f…` (= main); VPS Go 1.27.4; 38 GB free; ready 200.

## Transport and Gate L

`scp` of `image.tar` and the cutover script to `~/release-a08ff71/` (0700). `sha256sum -c` OK for
both before the single `docker load`. Loaded image: revision `a08ff71…`, linux/amd64,
`10001:10001`, entrypoint `/usr/local/bin/api`, same three rootfs layers, binary `cbd3a401…`,
`go1.27.4` (VPS toolchain). Store ID `sha256:10deaccd…` differs from the archive config digest
`c8faba40…`, as Gate L allows.

## Cutover

Script `/root/adilbaga-go1274-cutover.sh` (SHA-256 `fd5e8fa7…f20b`), run as transient unit
`adilbaga-go1274-cutover` (invocation `7d675146…`), exit 0, runtime 2 min 42 s. Under
`/var/lib/adilbaga/deploy/lock`: preflight again (release.env/mode, no broker state, syncs idle,
tunnel active, old healthy, new image identity and binary hash and Go version) → baseline local
`auto_smoke.py` on `1cbd535` PASS → backup `/root/adilbaga-release.env.1cbd535.1794404467` →
tunnel stop 13:41:07Z → `release.env` = `a08ff71` → `compose up -d --force-recreate` → healthy
13:41:14Z, restarts 0 → readiness PASS → local smoke PASS → tunnel start 13:42:00Z (public outage
≈53 s) → public smoke via `https://api.aktau.market` PASS 13:43:05Z → `RESULT=CUTOVER_PASS`.
Automatic rollback to `1cbd535` was armed for every post-stop check and was not needed.
`api.env`, compose, DB, migrations, sync, scheduler and flags unchanged.

## Acceptance

- Installed `auto_smoke.py` (health, categories, milk filters, sorts, pagination, 400 cases,
  product detail, dashboard, CORS, Voice single/list, clarification + continue with Redis session
  TTL and deletion): baseline old local, new local, new public — all PASS.
- Independent workstation check: live/ready, `/api/categories`, `/api/dashboard`, products 200;
  `limit=101` → 400; `творог dekmy` and `dekmy творог` both 7 results, identical IDs and order;
  `творог` 54, `DEKMY` 26.
- Observation 13:54Z (≈13 min): `a08ff71`, healthy, 0 restarts, cloudflared active, ready 200,
  266 log lines since start, 0 `error` level, 0 `status` 5xx. Ten images kept (`695f7e3` …
  `a08ff71`).
- Voice through a real iPhone Siri Shortcut: `NOT_VERIFIED` (application-level Voice covered by smoke).

## Left as is

- `~/release-a08ff71/` (b2admin home: `image.tar`, script copy) can be deleted; the image is loaded.
- `/root/adilbaga-go1274-cutover.sh` and the release.env backup kept as evidence.
- The `1cbd535` blob-pinned exception in `scripts/deploy/auto-transport.mjs` stays; protected
  paths of the new active `a08ff71` equal main, so the next main release needs no exception.
