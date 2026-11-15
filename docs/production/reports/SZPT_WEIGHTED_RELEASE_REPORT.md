# SZPT phase 2 — weighted goods and 25 groups: production release 2026-11-14

**Final status: `MANUAL_DEPLOY_PASS`.** Migration `20261114000000_offer_price_basis` applied, then the API
moved from `98427c3` to `c7ba31f` by a manual cutover per `deploy/README.md` (not broker `DEPLOY_PASS`).
Active `c7ba31f`, rollback target `98427c3` (see `deploy/README.md` «Current release»).

| Part | SHA / object | PR | Time (UTC) |
|---|---|---|---|
| Frontend (Vercel) | `c7ba31f2a78a9869b5952fdb7345237a8367f7ec` (main) | #123 | merged 14:17:03Z |
| API + migration | `c7ba31f2a78a9869b5952fdb7345237a8367f7ec` (main; API code from #122) | #122 | merged 14:16:51Z |
| DB migration | `20261114000000_offer_price_basis` | #122 | applied ≈14:32Z |
| API cutover | `98427c3` → `c7ba31f` | — | 14:40:38–14:42:47Z |

Why: all positions of the SZPT list should be available now. Phase 2 adds per-kg prices for goods the
stores sell by weight (flag from the store data, never guessed from the name) and 15 new groups
(flour, bread, horns, potatoes, carrots, onions, cabbage, tomatoes, cucumbers, apples, sugar, beef,
minced meat, chicken parts, chicken). Spec `docs/superpowers/specs/2026-11-14-szpt-weighted-design.md`,
plan `docs/superpowers/plans/2026-11-14-szpt-weighted.md` (Task 10 = this release).

Operator: Backend 2 ran the DB steps from the workstation and typed every VPS command as `b2admin`,
approving each step; Claude Code wrote and rehearsed the scripts on local PostgreSQL 17 copies, reviewed
every output and never connected to the VPS or handled the DB credential.

## Order and why

Frontend first (works with the old API: same 10 groups, subtitle «10 групп продуктов»), then the
migration, then the API. The new API joins every SZPT query with `offer_price_basis`; without the view all
SZPT requests would return 500. The old API does not read the view, so the migration alone changes nothing
for users.

## Before the release

- Local CI on the frontend branch `4994754`: 10/10 groups PASS. GitHub CI on main `c7ba31f`
  (push run `43604050638`): 9/9 jobs `success`. The `Deploy production Go API` run triggered by the merge
  only ran offline checks; `gate`, `build_only` and `rollout` were skipped (`AUTO_DEPLOY_ENABLED=false`).
- Vercel production after merge: `/ru/szpt/rice` and `/kk/szpt/rice` show 10 groups and the subtitle
  «10 групп продуктов… / ӘМАТ тізімінен 10 өнім тобы…»; «Выгоднее за кг» puts `sort=unit_price_asc`
  in the URL and orders 318, 318, 318, 329…; 375 px width without horizontal scroll.
- `backend/prisma/security/rollback_aktau_api_reader_access.sql` (CI does not run it) was run by hand on a
  local DB with all migrations: it aborts with `Reader policy drift` and rolls back atomically. Main
  `42322b3` without this migration fails the same way: its guards still expect the Part04 baseline
  (5 policies, 5 reader ACLs) while `20261005000000_snapshot_history` added the `snapshots` policy/grant and
  `aktau_ingest_writer` adds 17 policies (23 in total). Pre-existing, not caused by this release, and not
  used by this release's rollback; to be fixed in a separate PR.

## Step 1 — dump

`ops/postgres/backup.sh` (main `c7ba31f`) in image `aktau-backup-tools:17` (pg_dump 17.11), encrypted to
key `F1CD4AC48D2BCD55…` (same key as the 2026-11-06/07 dumps), restored into a disposable local
PostgreSQL 17 with `ops/postgres/restore-test.sh` (`restore_checksum_and_exit_zero:PASS`).

- File `C:\Users\ADMIN\aktau-backups\full-20261114T142423Z\app-public-20261114T142506Z-u1B4rRaK.dump.gpg`,
  21 693 861 bytes, SHA-256 `be5831fd1ba0b3097134ca4a7256e6681a2a0a0ff441b864733e3671f430e340`,
  plaintext SHA-256 `8d02c1e9…069db`.
- Row counts before dump = after restore for all 12 public tables: offers, raw_products and
  product_mappings 66 784 each, canonical_products 6 019, product_identities 5 651, price_history 8 963,
  source_runs 56, store_locations 18, snapshots 14, categories 10, `_prisma_migrations` 10, stores 4.
  (The script's first verdict said FAIL only because Supabase and the local DB sort `_prisma_migrations`
  differently; the sets are identical. The script now sorts with `COLLATE "C"`.)
- Source state: 10 migrations applied, last `20261107000100_product_identities`, no `offer_price_basis`.
- Single copy on the operator workstation; no scheduled DB backups exist.

## Step 2 — check before the migration

`ops/postgres/szpt/offer_price_basis_check.sql` (SHA-256 `aaf3da37…8081`) as the DB owner, 14:27Z,
latest published snapshot `8c4b2b4c-a4f6-4800-9ac3-9d272c9ccfcf` (13:03:07Z):

| Store | Offers | Weighted (rule) | DANA by name only |
|---|---:|---:|---:|
| ANVAR | 1 590 | 172 | — |
| DANA | 1 148 | 97 | 3 |
| DINA | 1 957 | 200 | — |
| FIX_PRICE | 71 | 0 | — |

`pricePerUnitMultiplier`: ANVAR 171 × 1000 g, 1 × 500 g; DANA 97 × 1000 g; DINA 170 × 1000 g plus
500 g–50 kg packs (sacks, cheese wheels, a 12 kg box). Live groups with all-weighted offers: dairy 103,
groats 22 (for information). Same-store duplicate offers (release stop condition): **0**. Verdict **GO**.

## Step 3 — migration

Workstation, `backend` of main `c7ba31f`, Prisma 5.22.0, owner URL via the Supabase session pooler (5432):
`migrate status` showed exactly one pending migration, operator typed `APPLY`, `migrate deploy` applied it,
`migrate status` → «Database schema is up to date».

- Privileges: `aktau_api_reader` SELECT on the view = true, on `raw_products` = false; `anon` and
  `authenticated` on the view = false; view owner `postgres`.
- Check after the migration: `offers 4766 view_rows 4766 view_weighted 469 view_mismatch 0 post_stop f`;
  per store the view gives the same weighted counts as the rule (172 / 97 / 200 / 0). Verdict **GO**.

**Rollback correction.** The plan and spec said `DROP VIEW` then `prisma migrate resolve --rolled-back`.
Rehearsal showed that `resolve --rolled-back` fails with P3012 for a successfully applied migration, and a
finished row with `rolled_back_at` set still counts as applied. The working rollback (rehearsed:
apply → rollback → apply again) is one transaction: `DROP VIEW public.offer_price_basis` and
`DELETE FROM public._prisma_migrations WHERE migration_name = '20261114000000_offer_price_basis'`; after it
`migrate status` lists the migration as pending again. Spec and plan are corrected. With the new API live
this rollback is allowed only after the API is back on `98427c3`.

## Step 4 — latency gate (before the API)

`ops/postgres/szpt/szpt_members_explain.sql` from `c7ba31f` (SHA-256 `b16ad795…e4cd`, `sha256sum -c` OK on
the VPS), run with `DATABASE_URL` of `/etc/adilbaga/api.env` in a throwaway `postgres:17-alpine` container
(the VPS has no `psql`; image removed afterwards). Role `aktau_api_runtime`: `api_reader = t`,
`reads_raw_products = f`; snapshot `8c4b2b4c…`.

| Query | Cold | Warm | Limit |
|---|---:|---:|---:|
| `rice`, `price_asc`, first page | 248.2 ms | **60.9 ms** | 300 ms and 3 × 546.7 ms |
| `potatoes` (weighted), `unit_price_asc`, first page | 42.9 ms | **42.4 ms** | same |

Baseline `/api/szpt` on `98427c3` (5 × curl on 127.0.0.1): median `time_total` 0.5467 s. PASS.

## Step 5 — API

### Artifact

- Build-only run `43605691577` (mode `build`, `ci_run` 43604050638; rollout skipped). Artifact
  `14118183085` `adilbaga-api-c7ba31f2a78a9869b5952fdb7345237a8367f7ec-43605691577-1`, digest
  `dc9e74d2…6ec2`.
- `image.tar` `a0bb5cb8af379a41ecb7b39371fbefb1b1d7ee4f76b7e1b9105fe5d91fc6ad9b` (22 042 624 bytes, = manifest).
- Workstation Gate L: revision `c7ba31f…`, linux/amd64, `10001:10001`, entrypoint `/usr/local/bin/api`;
  rootfs `75f1d965…`, `04bf98db…`, `30b3134f…` = manifest; binary
  `e71499f8b892dbffdc61e1af6309e5609af34729ed1b133427533a1c1a5f21d2`, **go1.27.4**.

### VPS

- `scp` to `~/release-c7ba31f/` (0700); `sha256sum -c` OK for `image.tar` and the script.
- Preflight 14:39:40Z (read-only): `release.env` = `98427c3`, healthy, 0 restarts (started 2026-11-13
  12:32:10Z); cloudflared active; `aktau-sync`/`aktau-sync-full` inactive; no `*.json` in
  `/var/lib/adilbaga/deploy/`; 39 GB free.
- After `docker load`, Gate L on the VPS matched the workstation (revision, platform, user, entrypoint,
  three layers, binary `e71499f8…`, go1.27.4).

### Cutover

Script `/root/adilbaga-szpt-weighted-cutover.sh`
(SHA-256 `90f0202a20d02d3846019899eecceb614860e19163679aed6ff0674bd1abf2d5`) = the hotfix script
(`5883c601…`) with `NEW`, `OLD`, `NEW_BINARY_SHA`, the temporary binary path and the backup prefix changed,
and a stricter SZPT check: more than 10 groups, every `defaultSort` valid, weighted groups default to
`unit_price_asc` (`potatoes` if present), and the first weighted group lists products. Transient unit
`adilbaga-szpt-weighted-cutover` (invocation `9bacccd0…`), exit 0, runtime 2 min 9.5 s.

Sequence: preflight PASS 14:40:38Z → baseline local smoke on `98427c3` PASS → backup
`/root/adilbaga-release.env.98427c3.1794667266` 14:41:06Z → tunnel stop 14:41:06Z → healthy 14:41:13Z →
readiness and local smoke PASS → local SZPT PASS (`25 11 potatoes`) 14:41:53Z → tunnel start 14:41:54Z
(public outage ≈48 s) → public smoke and SZPT PASS (`25 11 potatoes`) 14:42:47Z → `RESULT=CUTOVER_PASS`.
Automatic rollback was armed and not needed. `api.env`, compose, sync, scheduler and flags unchanged.

## Step 6 — acceptance (public API)

- The 10 old groups are unchanged: counts equal the baseline taken on `98427c3` minutes before
  (rice 80, buckwheat 30, sour cream 71, cottage cheese 20, cheese 75, milk 125, kefir 20,
  sunflower oil 67, eggs 4, butter 18) and the first page ids are identical for both `price_asc` and
  `unit_price_asc` in every group.
- New groups vs the spec estimate: flour 26 (26), bread 9 (~10), horns 83 (~84), sugar 19 (18),
  beef 19 (~15), minced meat 9 (~10), chicken parts 25 (~27), chicken 16 (~16), potatoes 5 (5),
  carrots 5 (4), onions 2 (2), cabbage 3 (2), tomatoes 4 (3), cucumbers 3 (3), apples 9 (10).
  The only groups outside ±30 % have 2–4 items, where one item is more than 30 %.
- Weighted groups default to `unit_price_asc` (11 groups); every offer in them is `soldByWeight` with a
  per-kg unit price; minced meat mixes packs (450–500 g) and weighted offers and sorts correctly by ₸/kg.
- Per-kg price vs the Dina site: An-Noor broiler 1 490 = 1 490 ₸/kg (multiplier 2 kg), beef ribs
  3 900 = 3 900, beef goulash 5 300 = 5 300; beef «яблочко» 5 135 vs 5 140, Eco-Halal 12 kg box
  1 661 vs 1 730, young onion 110 vs 150. The per-kg arithmetic is right; the last three differ in the
  price itself (the site without a delivery address shows another store's prices; the snapshot is 13:03Z).
- «Лук молодой весовой» in «Лук репчатый» is correct: 110–165 ₸/kg by weight, while green onion is sold
  per piece (305 ₸). Breads «Скандинавия», «Ромашка», «Президентский» are not in the bread group.
- (Fixed 2026-11-15 by `0a7bf2a`, see «Follow-up hotfix 0a7bf2a».) False member found: **«Капуста красная»** (DANA 433 ₸/kg, ANVAR 1 350 ₸/kg) in «Капуста белокочанная»
  — the exclude list has `краснокоч` but not `красн`. Fix by a separate group-rule hotfix.
- Questionable, left for the owner: «Мясо Отан Синюга говяжья» in «Говядина»; «Морковь желтая» in «Морковь».

### Observation

14:57:12Z (≈16 min after the start): `c7ba31f`, healthy, 0 restarts (started 14:41:06Z), cloudflared active,
`READY_PASS`; 472 log lines since start, 0 `ERROR` level, 0 `status` 5xx (the API logs JSON via `slog`).

## Left as is

- `~/release-c7ba31f/` and `~/szpt-release/` (b2admin home) can be deleted; the image is loaded.
- The cutover script in `/root` and the release.env backup are kept as evidence.
- Known minors (not blocking): the DANA weighted rule treats «ё» as a word boundary (view and
  `pipeline/src/mapping/weight.ts`); the latency gate command shows the DB URL in the VPS process list while
  `psql` runs; the reader-role rollback script is stale (see «Before the release») — fixed by PR #128
  (2026-11-15), which also runs it in CI.
- Kazakh names of the 15 groups and the Kazakh subtitle are drafts for a native speaker (PR #123).
- Jira comment: by the owner's decision.

## Follow-up hotfix 0a7bf2a (2026-11-15)

Release `0a7bf2ae24f8d580429ea3fecce5b946bbac00e8`, MANUAL_DEPLOY_PASS. No migrations, no dump, no latency gate.

### Scope

- PR #126 (group rules). `cabbage`: exclude `краснокоч` → `красн` («Капуста красная», DANA and ANVAR).
  `beef`: new exclude `синюг` («Мясо Отан Синюга говяжья», owner decision). «Морковь желтая» stays in
  `carrots` (owner decision), pinned by a fixture row. Before the change the full production members of the
  three groups were read (`/api/szpt/<slug>/products?limit=100`): no other false members.
- PR #127: frontend cache flush helper (`ops/frontend/revalidate_frontend.py`, deploy/README «Frontend cache
  flush»). The cutover script calls it after `RESULT=CUTOVER_PASS` and after an automatic rollback.
- PR #128: reader-role rollback script fix, run in CI. Not part of the API image.
- `main` 0a7bf2a = all three merges; `backend-go/` is the same as the #126 merge `8e942dc`.

### Artifact

- CI push run `43719039155` 9/9. Build-only run `43719710838` (mode `build`, rollout skipped). Artifact
  `14163842249` `adilbaga-api-0a7bf2ae24f8d580429ea3fecce5b946bbac00e8-43719710838-1`, digest
  `f06249ec…39bb`.
- `image.tar` `569d84ac22911118babe9352cb2809204c53700b828a733dda4fae2877a81db3` (22 042 624 bytes, = manifest).
- Workstation Gate L: revision `0a7bf2a…`, linux/amd64, `10001:10001`, entrypoint `/usr/local/bin/api`;
  rootfs `75f1d965…`, `b00bb46b…`, `a04d1a76…` = manifest; binary
  `39921cb76255975cd0678c667a1750b8bbd50752c717b2831e1c7f08d9b5718d`, **go1.27.4**.

### VPS

- `scp` to `~/release-0a7bf2a/` (0700); `sha256sum -c` OK for `image.tar`, the script and the helper.
- Preflight 13:39Z (read-only): `release.env` = `c7ba31f`, healthy, 0 restarts (started 2026-11-14
  14:41:06Z); cloudflared active; `aktau-sync`/`aktau-sync-full` inactive (13:00Z sync finished); no `*.json`
  in `/var/lib/adilbaga/deploy/`; 39 GB free.
- Helper installed as `/usr/local/sbin/adilbaga-revalidate-frontend` (root, 0755, SHA-256 `015e1de8…eddc`);
  a test run on the old API gave `REVALIDATE_PASS host=aktau.market status=204`.
- After `docker load`, Gate L on the VPS matched the workstation (revision, platform, user, entrypoint,
  three layers, binary `39921cb7…`, go1.27.4).

### Cutover

Script `/root/adilbaga-szpt-0a7bf2a-cutover.sh`
(SHA-256 `e2bf572e562f07f4a32af8b38551d59c7924bcdc458f4c032103b45c060e60f4`) = the phase 2 script
(`90f0202a…`) with `NEW`, `OLD`, `NEW_BINARY_SHA`, the temporary binary path and the backup prefix changed,
plus: the helper must exist (root-owned, executable) in the preflight, and the cache flush runs after
`CUTOVER_PASS` and after an automatic rollback (its result is logged, it is not a gate). Transient unit
`adilbaga-szpt-0a7bf2a-cutover` (invocation `71ab4d6f…`), exit 0, runtime 2 min 3 s.

Sequence: preflight PASS 13:40:31Z → baseline local smoke on `c7ba31f` PASS → backup
`/root/adilbaga-release.env.c7ba31f.1794750059` 13:40:59Z → tunnel stop 13:40:59Z → healthy 13:41:06Z →
readiness and local smoke PASS → local SZPT PASS (`25 11 potatoes`) 13:41:41Z → tunnel start 13:41:42Z
(public outage ≈43 s) → public smoke and SZPT PASS 13:42:32Z → `RESULT=CUTOVER_PASS` →
`REVALIDATE_PASS host=aktau.market status=204` 13:42:33Z. Automatic rollback was armed and not needed.
`cp -n` printed a coreutils portability warning; the backup was written and checked.

### Acceptance

- Baseline of all 25 groups (members of every page, `defaultSort`) taken on `c7ba31f` at 13:40:06Z, after the
  13:00Z sync; compared at 13:43:51Z on `0a7bf2a`: `cabbage` 3 → 2 (only «Капуста красная» gone), `beef`
  19 → 18 (only «Мясо Отан Синюга говяжья» gone); the other 23 groups have identical members and
  `defaultSort`. «Морковь желтая» is still in `carrots` (4).
- Frontend right after the flush (13:44Z): `/ru/szpt/cabbage`, `/kk/szpt/cabbage`, `/ru/szpt/beef` no longer
  show the removed products and still list the others; subtitle «25 групп продуктов» / «25 өнім тобы».

### Observation

13:57:53Z (≈17 min after the start): `0a7bf2a`, healthy, 0 restarts (started 13:41:00Z), cloudflared active,
ready 200; 347 log lines since start, 0 `ERROR` level, 0 `status` 5xx. 14 API images on the VPS, including
`c7ba31f` (rollback) and `0a7bf2a`.

### Left as is

- `~/release-0a7bf2a/` (b2admin home) can be deleted; the image is loaded.
- The cutover script in `/root` and the release.env backup are kept as evidence.

