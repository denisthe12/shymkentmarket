# Private application PostgreSQL backups — local foundation

> **Aktau legacy/reference — NOT Shymkent operating instructions.** Роли и примеры операторских процедур ниже унаследованы от Актау. Для работы над Шымкентом не используйте эти инструкции с унаследованной БД, backups или credentials. Безопасные проверки описаны в [общем onboarding](../../docs/developer-onboarding.md#локальные-проверки).

No scheduler, storage provider or production recovery is configured. Commands
are operator-only, not API runtime tooling. Use the explicit current application
database, **not** a separate empty backup database; do not fall back to runtime
DATABASE_URL, DIRECT_URL or SMOKE_DATABASE_URL.

## Backup

Prerequisites: Node24, PostgreSQL17 client tools matching source major,
GnuPG with an independently configured recipient. Do not automatically install
tools. Shell tracing must be off. Privately source a 0600 operator env file:

```bash
set +x
set -a
source /absolute/private/operator-backup.env
set +a
bash ops/postgres/backup.sh
```

Required configuration:

- BACKUP_DATABASE_URL: direct operator connection to the current application DB.
- BACKUP_OUTPUT_DIR: absolute private 0700 directory outside the repository.
- BACKUP_GPG_HOME: absolute private GnuPG keyring outside the repository.
- BACKUP_GPG_RECIPIENT: full public recipient fingerprint (40–64 hex characters).

The command dumps **all public application tables/schema**, not only API-visible
tables, using custom format, no-owner/no-acl. Supabase-managed schemas are not a
portable application restore. Cluster-global roles/passwords are not in pg_dump.
Never put an operator credential into API configuration.

URLs are parsed into private libpq environment fields: no DSN/password in argv.
Unknown URL options fail. Backup reads have read-only session defaults and bounded
connect/statement timeouts. Guard rejects relative/repo/symlink-to-repo paths and
artifacts/TODO/node_modules paths. umask077; plaintext temp directory0700, files600;
EXIT cleanup removes plaintext and incomplete ciphertext. Metadata600 contains
timestamp, filename, size, tool version and plaintext SHA256 only. GPG uses
public-key encryption, not custom crypto. A filename ending in .gpg is **not**
sufficient proof: recovery must decrypt/check SHA256/validate custom format.

## Restore drill — local only

Prepare a new owned loopback PostgreSQL17 container/database privately. No public
bind, production credentials or production host. Configure RESTORE_DATABASE_URL
to literal 127.0.0.1 or ::1, explicit port, database named `part11_*`, no URI query
parameters; use private local credentials. Set BACKUP_FILE to the encrypted
`.dump.gpg` and BACKUP_GPG_HOME to the outside-repo decryption keyring:

```bash
bash ops/postgres/restore-test.sh
```

The target must be a freshly created disposable database. The script does **not**
drop existing schemas/tables. It decrypts to a private temporary file, verifies
the adjacent manifest's plaintext SHA256, validates custom format and restores
with **--exit-on-error**; zero exit is mandatory. Plaintext is removed on failure
or success. Missing/invalid target or non-loopback target is rejected first.

RLS policy role references require **local-only** NOLOGIN prerequisites
aktau_api_reader and aktau_ingest_writer, plus aktau_retention_writer once that
role exists in production (new dumps then hold its policies and
`pg_restore --exit-on-error` fails without it). Restore no-owner/no-acl intentionally
does not recreate production owners/ACLs/logins/passwords. Verify schema/RLS/
policies/constraints/indexes/history plus all table counts/fingerprints before
local least-privilege setup. Reconstruct only reviewed LOCAL reader grants:
public USAGE, SELECT on categories/canonical_products/offers/stores/
store_locations/snapshots; a local safe LOGIN with sole reader membership,
ADMIN=false/INHERIT=true/SET=false. No private3 SELECT. Do not rerun guarded
production bootstraps against an already activated role.

Then run local Go health/GET smoke using that restricted local credential.
Remove only owned disposable resources and decrypted/plaintext artifacts. Keep
encrypted backup and a recoverable private key outside repo; never archive either.

## Integrity and operations

Compare counts and deterministic ordered row fingerprints for all ten app
tables plus _prisma_migrations. Floating confidence fingerprints use PostgreSQL
float8send bytes plus canonical non-float JSON rather than formatter-dependent
float JSON text; no rounding/normalization that could conceal data loss.
Compare columns/enums/functions/constraints/indexes/RLS/policies, latest published
snapshot, SourceRun history and migration records. On mismatch STOP: never label
partial restore PASS or repair production to match a backup.

Retention policy: **7 daily + 4 weekly + several monthly** encrypted recovery
points; exact monthly count selected during operations review. Record creation
time/checksums; no automatic pruning/deletion of backups. Prove recovery regularly.
(Not to be confused with snapshot retention inside the DB: after each daily sync
`cmd/prune -keep 14` deletes old published snapshots, see `ops/sync/README.md`.)
Current private owner-workstation encrypted copy is off the managed DB server,
not final disaster redundancy. Independent off-VPS storage/provider and key
custody/escrow must be reviewed before deployment; no provider chosen here.

**Backup scheduler NOT CONFIGURED; backup alerts NOT CONFIGURED** (checked on the VPS
2026-11-11: no backup timer besides the system `dpkg-db-backup`). Backup scheduling/pruning,
off-VPS delivery and independent key backup are future operations activation.
API availability alerts are separate: `ops/monitor/README.md`.
See [rollback](../../docs/runbooks/rollback.md) and
[rotation](../../docs/runbooks/secret-rotation.md).

Synthetic guard/cleanup tests (no DB/network writes):

```bash
node --test ops/postgres/backup.test.mjs
```

Those test doubles do not prove encryption/restore; the actual PG17/GPG drill
provides that evidence separately in the Part11 report.

## Recovery: one private Owner input procedure


Owner supplies **one existing approved dedicated read-only operator context**
through a local private file, outside every source checkout. Do not send it in
chat. File owner is the executing operator, 0600, single link, no symlinks;
ancestor directories root/operator-controlled, no effective group/other write
(root sticky temporary ancestor allowed). Storage and existing GPG home must be
separate owned 0700 directories outside source. No value is discovered or copied
from API/ingest env. No credential/key is generated by the validator.

Exactly four unquoted `NAME=value` lines, final LF; no shell syntax, expansion,
comments, duplicate names, multiline values or whitespace. URI-encode reserved
characters. Keys: `BACKUP_DATABASE_URL`, `BACKUP_OUTPUT_DIR`, `BACKUP_GPG_HOME`,
`BACKUP_GPG_RECIPIENT`. DSN must use `sslmode=verify-full`; recipient is full
40/64 hexadecimal fingerprint. The stricter operator validator does not relax
the existing backup guard. Explicit check reads only that file and those two
directories; tool probes are bounded and their output suppressed:

```bash
node scripts/ops/prepare-recovery-operator.mjs --check "$OWNER_OPERATOR_HANDLE"
```

Default/`--offline` never reads env, files or network and returns
`MISSING_OPERATOR_INPUT`. Explicit check emits only `READY`,
`MISSING_OPERATOR_INPUT`, `INVALID_CUSTODY`, `BLOCKED`; non-READY exits 1.
READY is **configuration readiness**, not DB identity, connectivity or parity.
The parser never `source`s/evaluates dotenv; do not log its returned object.

Before backup, the independently approved operator must establish in a bounded
READ ONLY transaction: real session/current role identity; no superuser,
CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS; no effective write/DDL role
membership or public schema CREATE; full public-table SELECT sufficient for
pg_dump; finite connect/statement/lock deadlines. Inspect all effective roles,
not a role-name guess. Record latest published snapshot/as-of separately from
API dashboard.snapshotAt. If suitability cannot be proved, STOP. This CLI
deliberately does not connect to the database or certify role privileges.

After those gates, this runnable packet passes the parsed configuration only
to unchanged backup tooling, with no DSN in argv or raw child output:

```bash
set +x
node --input-type=module - "$OWNER_OPERATOR_HANDLE" <<'JS'
import { checkOperator, readOperatorContext } from './scripts/ops/prepare-recovery-operator.mjs';
import { spawnSync } from 'node:child_process';
if (checkOperator(process.argv[2]) !== 'READY') process.exit(1);
const values = readOperatorContext(process.argv[2]);
const r = spawnSync('/usr/bin/timeout', ['--signal=TERM', '--kill-after=5s', '420s', '/bin/bash', 'ops/postgres/backup.sh'], {
  env: { PATH: process.env.PATH, ...values }, stdio: 'ignore',
});
console.log(r.status === 0 ? 'BACKUP_COMPLETED' : 'BLOCKED');
process.exitCode = r.status === 0 ? 0 : 1;
JS
```

Keep the file/context in exclusive operator custody through execution. Use the
unchanged guarded restore procedure above on a **new**
loopback PG17 `part11_*` target, local NOLOGIN role prerequisites, no production
credentials. Verify checksum/custom format/exit0, ten table counts, snapshot and
SourceRun history, migrations/checksums, RLS/policies/constraints/indexes/orphans
and restricted local Go smoke. Use unchanged
[`pm-audit-v1`](../../scripts/perf/product-mappings-audit.sql) for binary-safe
source/target comparison for the same recovery point. No matching source proof
means `RESTORE_VERIFIED_SOURCE_PARITY_PENDING`, never full parity. Clean only
owned local plaintext/disposable resources; never prune older backups.

## SQL operator commands

From the repository root with Node 24 and PostgreSQL client tools, disable shell
tracing and privately export the appropriate connection from a protected operator
env file. For import, backfill, or migration checks use the existing authorized
owner/migration credential as `DATABASE_URL`:

```bash
node ops/postgres/psql-run.mjs import-price-history < history.csv
node ops/postgres/psql-run.mjs backfill-product-identities
node ops/postgres/psql-run.mjs offer-price-basis-check
```

These are separate operations. Follow the existing sync and migration windows.
For the read-only SZPT release check export the existing API login connection
as `API_DATABASE_URL` and run `node ops/postgres/psql-run.mjs szpt-explain`.
The launcher never falls back from the reader variable to the owner variable.

The launcher accepts one operation name. It places decoded libpq fields in the
child environment, strips inherited PG overrides, and accepts only sslmode,
sslrootcert, channel_binding and connect_timeout URL options. Standard output
preserves SQL results. Driver stderr is replaced by a nonsecret category and
psql exit codes are preserved. Root and the same OS user may still inspect
process environments. Keep operator credentials private.
