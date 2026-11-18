# AGENTS.md — Shymkent Market

## Purpose and ownership

These are durable instructions for coding agents in the **Shymkent Market**
repository, `denisthe12/shymkentmarket`. They apply across branches and tasks.
Keep task numbers, current SHAs, PR statuses and transient milestones in the
individual task/report, not here.

Shymkent Market is a bilingual (RU/KK) service for finding and comparing grocery
prices, offers and retail locations in **Shymkent, Kazakhstan**. Reuse the
compatible architecture of Aktau Market without importing its city-specific data
or infrastructure. The reference repository `kiratonine/AdilBaga` is **read-only**:
never push, create branches/PRs, or alter its worktrees, remote settings, Actions,
environments or production. Never assume that a working Aktau deployment means a
working Shymkent deployment.

The public Go API serves **published PostgreSQL snapshots**. Retailer scraping,
normalization and publication belong in the pipeline; they never execute inside
public API request handlers. Make minimal, compatible, test-backed changes.

## Sources of truth

Start with the current Owner-approved task, the actual branch/code/tests and the
applicable nested `AGENTS.md` / `AGENTS.override.md`. For project context and the
review cycle, consult `01_SHYMKENT_MARKET_PROJECT_CONTEXT.md` and
`02_SHYMKENT_MARKET_AI_WORKFLOW.md` when supplied in the task workspace.
Within the repository, consult:

- `README.md`, `docs/README.md`, `docs/developer-onboarding.md` — project
  overview, documentation status, and local setup.
- `contracts/openapi.yaml`, `docs/production/API_V1_CONTRACT.md` — API v1 contract.
- `backend-go/README.md` — Go API conventions and tests.
- `frontend/AGENTS.md` — Next.js conventions. The inherited `frontend/README.md`
  is a reference. Follow the Shymkent onboarding guide for local setup.
- `deploy/README.md`, `docs/production/FRONTEND_VPS_DEPLOYMENT.md` — Aktau release references.
- `ops/sync/README.md`, `docs/data/SYNC_RUNBOOK.md` — inherited ingestion references for Backend 2.
- `.github/workflows/`, `scripts/ci/README.md` — actual workflow entry points and CI.

Roadmaps, old phase plans, historical status reports and Aktau runbooks are not
proof of Shymkent production state. Verify current code and environment identity;
flag contract/safety conflicts instead of silently choosing an interpretation.

## Repository areas

```text
frontend/      Next.js App Router, RU/KK UI, SEO and map
backend-go/    public Go API: catalog, offers, dashboard, SZPT, Voice
backend/       Prisma schema and migrations; historical NestJS code is not the public API
contracts/     OpenAPI v1 and compatibility tests
pipeline/      source adapters, matching, snapshot preparation
ops/           sync, status, PostgreSQL, observability and cache operations
deploy/        Go API release and rollback procedures
scripts/ci/    quality checks, integration and disposable staging
docs/          living guides, historical plans, and review reports
.github/       CI, release workflows and repository automation
```

Keep API, frontend and data publication lifecycles separate. Do not create a
second frontend or a competing migration history.

## Team boundaries

- Backend 1 / Owner owns the Go API, integration and repository-wide coordination.
- Backend 2 owns PostgreSQL, schema and migrations, source approval, adapters,
  store data, matching, ingestion and the publication pipeline.
- Frontend owns UI, branding, articles and blog, SEO, sitemap, robots and city metadata.

Before editing another team's code, configuration or working instructions,
give the Owner the paths, reason and impact so they can approve scope with the
responsible developer. Continue independent work in the approved scope.

## Shymkent-specific boundaries

- Shymkent gets **its own** PostgreSQL data, retail locations, source approvals,
  matching, pricing, credentials, Redis, HMAC and service identities.
- Do not copy Aktau production databases, price snapshots, source credentials,
  DNS/tunnel identifiers, VPS addresses, SSH keys, domains or service paths.
- Existing Aktau store names and counts are not Shymkent requirements.
  Sources and schedules must be authorized in a separate task.
- City-facing UI text, canonical/hreflang, sitemap, geolocation/map defaults and
  public links will be localized by approved tasks; do not invent live locations.
- Treat all inherited production targets and scripts as **not activated for
  Shymkent** until verified and expressly approved by the Owner.
- For first-stage tests, use synthetic fixtures and verifiably disposable
  infrastructure only. No live scraping, ingestion or production deploy.

## Standard task workflow

1. Read the full task and approvals; inspect all applicable agent instructions.
2. Verify repository path/identity, branch, worktree and remote URLs; protect
   tracked, untracked and ignored local changes.
3. Verify the approved baseline and applicable contracts and tests. Create or
   reuse one topic branch and one permanent WSL linked worktree per task at
   `/home/denis/tmp/<kebab-case-task>`. Inspect existing paths before creation.
4. Make the smallest change in that worktree, add needed regression coverage and
   update living docs. Use the task branch and one Shymkent PR into `main`.
   Keep review fixes in the same worktree, branch and PR as new commits.
5. Run targeted tests, then relevant CI-equivalent checks. Report exact
   commands and `PASS`, `FAIL`, `SKIP`, `NOT_RUN` separately.
6. Prepare the approved report, exact-HEAD evidence and clean review archive.

Ordinary failures should be reproduced, fixed within scope and retested.
Escalate genuine data-loss, contract, privilege-boundary, credential, missing
permission or resource-identity risks with concrete evidence. Do not overwrite
another person's work to make the worktree appear clean.

## Engineering rules

- Follow existing Go, TypeScript, SQL and Python conventions and pinned tools.
- Keep handlers thin; isolate I/O and deterministic domain logic.
- Validate untrusted inputs, bound resource use and return explicit errors.
- Preserve API behavior unless the task expressly authorizes a contract change.
- Avoid gratuitous dependency/tool upgrades and broad refactoring.
- Edit generators and source files, not just generated outputs.
- Never log credentials, private payloads, full voice utterances, precise user
  coordinates, session capabilities or raw production logs.

## API and Voice

The public production-designated API is **Go**, not NestJS.
`contracts/openapi.yaml` defines public wire behavior; preserve endpoints,
status codes, DTOs, sorting, pagination, filters, errors and SZPT equivalence.
Health endpoints are operational and outside the frozen OpenAPI.

Prices, offers, basket and dashboard calculations are deterministic server/SQL
logic, not frontend calculations. Gemini is for extracting voice intent and
filters, **not** for choosing stores, products or prices. Validate model output.
Redis holds short-lived dialogue state; no fixture or in-memory session fallback
may silently replace production Redis. Keep provider failures and timeouts safe.

## Database and pipeline safety

`backend/prisma/` owns schema/migrations; `pipeline/` owns ingestion and
snapshot preparation. Preserve transactionality, snapshot integrity, isolation
of API/read, ingest/publish and administrative roles, and existing grants.

Only execute migrations, imports, seeds, destructive tests, SQL writes and
cleanup against a **verified disposable database** unless a task specifically
authorizes otherwise. Verify the effective connected database/server/role,
not just a DSN substring. Never print secrets or connection strings. Use
parameterized SQL; treat source material as untrusted.

No assumption of a Shymkent Supabase project, hosted DB or active credentials
is authorized by this file.

## Frontend

`frontend/` is the only Next.js application. Read its nested instructions
and version-correct docs. Honor RU/KK behavior, accessibility, SEO and image
handling, as well as the Go API contract. Production configuration must be
explicit; mock providers/data are dev/test-only. The precise Shymkent domains,
coordinates and addresses are separate approved work.

## GitHub Actions and release isolation

- Audit `.github/workflows/`, reusable actions, trigger conditions, permissions,
  scripts, GitHub environments/variables and external targets **before pushing**.
- A workflow copied from Aktau is **not automatically authorized** to build,
  publish, deploy or contact production for Shymkent. Keep inherited release
  gates fail-closed until a dedicated Owner-approved release task.
- Do not simply replace `kiratonine/AdilBaga` with `denisthe12/shymkentmarket`
  in production gating: that can unintentionally enable release jobs.
- Distinguish read-only/offline checks from actions that can contact external
  services or mutate infrastructure. Disable or isolate unsafe entry points
  before any push, PR or CI trigger. Never copy real Aktau secrets to GitHub.
- Do not alter repository protections, environments, variables, secrets,
  credentials, SSH or production targets without explicit approval.
- Treat `workflow_run`, `workflow_dispatch`, `pull_request_target`, `push`,
  reusable workflows, scripts and environment approvals as potential paths.

## Validation

Use manifest/lockfile-pinned versions; do not assume a root pnpm workspace.
For a task affecting these components, relevant commands from repository root
include:

```bash
node scripts/ci/run-checks.mjs contracts
node scripts/ci/run-checks.mjs go
node scripts/ci/run-checks.mjs schema
node scripts/ci/run-checks.mjs frontend
node scripts/ci/run-checks.mjs pipeline
node scripts/ci/run-checks.mjs security
node scripts/ci/run-checks.mjs ops
```

For **verified disposable** integration infrastructure only:

```bash
node scripts/ci/run-db-integration.mjs
node scripts/ci/run-ephemeral-staging.mjs
```

Inspect scripts and prerequisite configuration before running them. Run focused
regression tests and relevant full checks. Verify GitHub CI conclusions for
the exact final HEAD; historical or different-SHA CI is not a PASS. Do not
claim manual Voice/Siri, DB, staging or production checks that did not run.

## Git and permissions

`origin` must refer to `denisthe12/shymkentmarket` for this checkout.
Read Aktau only through explicitly read-only fetch/inspection; preserve a
pinned fetched SHA. Verify push destination separately from fetch URL.

Use topic branches and PRs when a task authorizes them. Keep auto-merge and
production deployment disabled. Merge or deploy only under separate explicit
Owner authorization for that action. Never force push, rewrite published
history or bypass review/CI.
Avoid `git reset --hard`, destructive rebases and `git clean -fd[x]` unless
specifically approved for bounded recovery. Inspect ignored/untracked work
before branch switches and archive operations. Retain rollback evidence.

## Production boundaries

SSH, Docker/service mutations, database writes, migrations, credential changes,
cache flushes and deployment require **separate explicit Owner approval**.
A local build or CI test never implies production permission. Follow current
runbooks only after verifying that their resource identities belong to
Shymkent. Never run Git as root in a service-user-writable checkout; do not
escalate privileges to bypass filesystem checks.

## Reports and clean archives

Document actual baseline/HEAD SHAs, changed files, decisions, checks, failures,
retests, risks and the stage's stop condition in a per-task report under
`docs/production/reports/`. Record mutable PR URLs, final HEAD and hosted job
conclusions in separate evidence so the tracked report can be committed before CI.

Build archives from a positive allowlist of changed Git-tracked paths at the
reviewed HEAD, plus explicitly reviewed external evidence. Include a manifest
with sizes, modes and SHA256, a deletion list, and archive SHA256. Verify
extracted bytes and safe relative paths. Exclude secrets, `.git`, `.env`,
private logs, dumps, credentials, build output, browser traces and dependency
directories. An ignore/denylist alone is insufficient.

Place the clean archive `<kebab-case-task>-<HEAD12>.tar.gz` and its `.sha256`
directly in `/home/denis/tmp`, outside the worktree. For review fixes, update the
report in the same task and package the new exact HEAD under a new archive name.

## Environment: Windows + WSL

Windows checkout: `D:\Install\projects\ShymkentMarket`

WSL checkout: `/mnt/d/install/projects/ShymkentMarket`

Run shell and tool commands **inside WSL**, using actual filesystem casing
verified on the machine. If `/mnt/d` filesystem semantics affect tests,
reproduce on a clean, byte-identical native-WSL copy/worktree without weakening
assertions or relaxing production timeouts. Prefer configured pnpm; preserve
lockfiles.

## RTK policy

Use RTK for supported commands.

Examples:

```bash
rtk git status
rtk git diff
rtk pnpm build
rtk pnpm test
rtk playwright test
rtk curl ...
rtk go test ./...
rtk go test -race ./...
rtk go vet ./...
rtk go build ./...
```

Use `rtk proxy` only when the RTK wrapper would change or prevent required command behavior.

Never claim PASS for a command not actually executed.

## Definition of done

The task's approved scope is implemented and verified with honest evidence;
contracts and living docs remain compatible; Shymkent is isolated from Aktau
production; no external data, secrets or unrelated work entered the deliverable.
Stop for unsafe/out-of-scope decisions; resolve routine problems independently.
