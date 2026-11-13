# SCRUM-25 «СЗПТ» production API releases — 2026-11-12 and 2026-11-13

**Final status: `MANUAL_DEPLOY_PASS` for both releases.** Manual cutovers per `deploy/README.md`,
not broker `DEPLOY_PASS`. Active `98427c3`, rollback target `e3fa08e` (see `deploy/README.md`
«Current release»).

| Release | SHA | PR | Cutover | Rollback target |
|---|---|---|---|---|
| SZPT endpoints | `e3fa08ea553e35670fd28e4293522750c0176bc7` | #115 | 2026-11-12 14:33Z | `a08ff71` |
| Group-rule hotfix | `98427c3889cb8bb6844749fe4baa5c7bbc847cf8` | #120 | 2026-11-13 12:32Z | `e3fa08e` |

Why: the team decision of 2026-11-11 adds a «СЗПТ» section with 10 groups selected by the criteria
of order No. 362-нқ, showing the package price plus the price per kg / l / 10 pcs, with no budget
filter. Spec `docs/superpowers/specs/2026-11-12-scrum-25-szpt-design.md`, plan
`docs/superpowers/plans/2026-11-12-scrum-25-szpt.md`. The frontend (`751db8a`, PR #116) ships
separately on Vercel.

Operator: Backend 2 typed every VPS command as `b2admin` and approved each cutover; Claude Code
wrote and reviewed the commands and the cutover scripts and never connected to the VPS.

## Release 1: `e3fa08e` — SZPT endpoints (2026-11-12)

### Source, CI, artifact

- Release SHA `e3fa08e…` = main head (PR #115 merge): `GET /api/szpt`,
  `GET /api/szpt/{group}/products`, contract in `contracts/openapi.yaml`. Existing DTOs and
  migrations unchanged.
- Exact-main CI push run `43234229103`: 9/9 jobs `success`.
- Build-only run `43236035038` (rollout skipped, `AUTO_DEPLOY_ENABLED=false`). Artifact
  `13952152936`, digest `5363eedc…2735`.
- `image.tar` `8b488d6a63a99300d7898207be7d6cc8ade457f818166d494c283bbd954430ba`
  (22 022 144 bytes, = manifest).
- Workstation Gate L: revision `e3fa08e…`, linux/amd64, `10001:10001`, entrypoint
  `/usr/local/bin/api`; rootfs `75f1d965…`, `3aff80f1…`, `a81183fd…` all equal the decoded
  layers; binary `0c70fdc79a2e925860019aa95b71b7919bdeb170ac19d6e5d680055d85b2cefd`,
  `go version` → **go1.27.4**.

### VPS

- Preflight 14:29Z (read-only) clean: `release.env` = `a08ff71`, healthy, 0 restarts, cloudflared
  active, syncs inactive, no broker state `*.json`, broker `7b8f5320…`, smoke `3f7a22c2…`, ready 200.
- `sha256sum -c` OK for `image.tar` and the script before `docker load`; Gate L on the VPS matched
  the workstation (revision, platform, user, entrypoint, layers, binary hash, go1.27.4).

### Cutover

Script `/root/adilbaga-szpt-cutover.sh`
(SHA-256 `d4120ddad36be849d3d68f367d0a970b5f0ad71c7a74ad5179399597f6d2c7c6`), transient unit
`adilbaga-szpt-cutover` (invocation `129bc0dd…`), exit 0, runtime 2 min 35 s. It extends the Go
1.27.4 cutover script with an SZPT check: `/api/szpt` returns non-empty `groups` and
`/api/szpt/rice/products?limit=1` returns 200, locally and publicly, with automatic rollback on
failure.

Sequence: baseline local smoke on `a08ff71` PASS → backup
`/root/adilbaga-release.env.a08ff71.1794493983` → tunnel stop 14:33:03Z → healthy 14:33:10Z →
readiness, local smoke and SZPT PASS (groups=10) → tunnel start 14:34:05Z (public outage ≈62 s) →
public smoke and SZPT PASS 14:35:07Z → `RESULT=CUTOVER_PASS`.

### Acceptance (public API)

- All 10 groups within ±7% of the spec estimate (spec allows ±20%).
- Unit-price sort is monotone; 400/404 errors as specified.
- `/api/categories` and `/api/dashboard` byte-identical to the pre-release baseline.
- Frontend `751db8a` checked on ru/kk and at 375 px.

## Release 2: `98427c3` — group-rule hotfix (2026-11-13)

### Why

Sampling on production (plan Task 11 Step 2) found false members in four groups. PR #120 adds
`Exclude` patterns in `backend-go/internal/szpt/groups.go` and fixture rows that pin them:

| Group | Added to `Exclude` | Example found on production |
|---|---|---|
| `cheese` | `mozzarel`, `мягк`, `бри` as a whole word, `brie`, `blue`, `блю`, `камамбер`, `camembert`, `плесен` | Galbani Mozzarella, soft Brie, President Le Blue |
| `cottage-cheese` | `клубник`, `малин`, `манго`, `маракуй`, `черник`, `персик`, `вишн`, `абрикос` | Творог 101 зерно Малина |
| `rice` | `паром` | Рис «обработанный паром» |
| `milk` | `молокосодерж` | Молокосодержащий продукт |

Versus `e3fa08e`, `backend-go/` differs only in `groups.go` and the SZPT fixture and test;
`contracts/` is unchanged.

### Source, CI, artifact

- Release SHA `98427c3…` = main head (PR #120 merge).
- Exact-main CI push run `43408178650`: 9/9 jobs `success`.
- Build-only run `43425088139` (rollout skipped). Artifact `14037091199`
  `adilbaga-api-98427c3889cb8bb6844749fe4baa5c7bbc847cf8-43425088139-1`, digest `a07448df…7f81`.
- `image.tar` `269fa5ba4de4aaf3dbdeecf4849b1541fead579b4941ba0453612c732ac9a5b2`
  (22 022 144 bytes, = manifest).
- Workstation Gate L: revision `98427c3…`, linux/amd64, `10001:10001`, entrypoint
  `/usr/local/bin/api`; rootfs `75f1d965…`, `793880f1…`, `a25e9938…` all equal the decoded
  layers; binary `c45d794e6cefef9e60c92451fbb1a822e3c2e97fe7444d0760adf18d83ddb792`,
  `go version` → **go1.27.4**.

### VPS

- Preflight 12:29–12:30Z (read-only) clean: `release.env` = `e3fa08e`, healthy, 0 restarts
  (started 2026-11-12 14:33:03Z); images `e3fa08e` and `a08ff71` present; cloudflared active;
  `aktau-sync`/`aktau-sync-full` inactive (next sync 13:00Z); no `*.json` in
  `/var/lib/adilbaga/deploy/`; broker `7b8f5320…`, smoke `3f7a22c2…`; ready 200; 38 GB free.
- `scp` to `~/release-98427c3/` (0700); `sha256sum -c` OK for `image.tar` and the script.
- After `docker load`, Gate L on the VPS matched the workstation: revision, linux/amd64,
  `10001:10001`, entrypoint, the same three rootfs layers, binary `c45d794e…`, go1.27.4.

### Cutover

Script `/root/adilbaga-szpt-hotfix-cutover.sh`
(SHA-256 `5883c6017aedc3203fcf246454e359d81d54653078d1bf42755ed8c515afd1d8`) is the release-1 script
with only `NEW`, `OLD`, `NEW_BINARY_SHA`, the temporary binary path and the backup prefix changed.
Transient unit `adilbaga-szpt-hotfix-cutover` (invocation `7252bb81…`), exit 0, runtime 2 min 3 s.

Sequence: preflight PASS 12:31:39Z → baseline local smoke on `e3fa08e` PASS → backup
`/root/adilbaga-release.env.e3fa08e.1794573129` 12:32:09Z → tunnel stop 12:32:09Z → healthy
12:32:16Z → readiness and local smoke PASS → local SZPT PASS (groups=10) 12:32:48Z → tunnel start
12:32:49Z (public outage ≈40 s) → public smoke and SZPT PASS (groups=10) 12:33:41Z →
`RESULT=CUTOVER_PASS`. Automatic rollback was armed and not needed. `api.env`, compose, DB,
migrations, sync, scheduler and flags unchanged.

### Acceptance (public API)

- Group counts before → after: rice 82 → 81, cottage cheese 24 → 20, cheese 80 → 76,
  milk 123 → 122; buckwheat 34, sour cream 72, kefir 21, sunflower oil 66, eggs 5, butter 19
  unchanged. The baseline was taken shortly before the release on the same published snapshot.
- No false members from the hotfix table remain in the four groups (milk checked in full, 122 items).
- `price_asc` and `unit_price_asc` are monotone in all 10 groups.
- Errors: unknown group 404, `size=123` 400, `limit=101` 400, `sort=price_desc` 400.
- `/api/categories` and `/api/dashboard` byte-identical to the pre-release baseline.
- Observation 12:47:52Z (≈15 min): `98427c3`, healthy, 0 restarts, cloudflared active, ready 200,
  312 log lines since start, 0 `error` level, 0 `status` 5xx.

## Left as is

- `~/release-e3fa08e/` and `~/release-98427c3/` (b2admin home) can be deleted; the images are loaded.
- Both cutover scripts in `/root` and both release.env backups kept as evidence.
- Not in scope: weighted goods, the other 21 items of the list, parser fixes («десяток», «970л»),
  unit price on the product page.
