# Security findings #2 and #3 remediation

Baseline main `33d662707b133440de9003d687e3b921e78414ed`. Source audit: local `TODO/report(1).md`, Finding #2 (CWE-214) and Finding #3 (CWE-770). The audit report is not redistributed. Production process visibility and traffic were not tested. Finding #1 is deferred to a separate read-only VPS audit. Findings #4–#8 are outside scope.

## Finding #2 — PostgreSQL operator arguments

Live import, backfill and release-check examples expanded a credential-bearing URL into positional psql arguments. `ops/postgres/psql-run.mjs` maps four fixed operation names to reviewed SQL files and uses split libpq fields in the child environment. It rejects extra arguments, malformed URLs, inherited PG redirects, duplicate parameters and unsupported options. There is no shell. Owner/migration operations use DATABASE_URL. The read-only SZPT check uses API_DATABASE_URL without fallback. Role privileges still come from PostgreSQL. SQL stdout and stdin remain connected. Driver stderr is suppressed, with bounded outcome categories and preserved psql exit codes. Same-UID and privileged processes can still inspect process environments.

Updated owner instructions in `ops/postgres/README.md`, `ops/sync/README.md` and the import and offer-price-basis SQL headers. Updated the SZPT golden generator in `backend-go/internal/postgres/szpt_explain_test.go` and regenerated `ops/postgres/szpt/szpt_members_explain.sql`. The SQL changes affect only comments. The historical SZPT plan links to the replacement recipe. Backup and restore launchers remain unchanged. Synthetic tests capture argv, PG fields and CSV bytes, exercise rejection and error paths, and guard live instructions through the existing Security suite.

## Finding #3 — readiness admission

Each request previously initiated a Ping on the same pool used by catalog, dashboard and Voice. The gate in `backend-go/internal/httpapi/readiness.go` is local to each Router and admits one active Ping. Calls arriving during an uncached Ping return the existing 503 envelope immediately. Success is cached for 1 second from completion and failure for 250 ms using monotonic time. A successful cache may briefly precede outage detection by up to 1 second. The admitted caller owns its context and the existing 5-second timeout. A canceled caller cannot start work if already canceled, a late success after cancellation is rejected, and admission is released even if Ping panics. There are no worker goroutines or queued DB probes. Only a failed Ping produces the sanitized readiness warning. The public 200/503 JSON, no-store policy, separate liveness, health limiter exemption, Docker healthcheck and four-connection pool remain intact.

`readiness_test.go` covers burst, cache expiry, outage, recovery, isolation and late success after cancellation. The existing loopback tests cover a 4.5-second cold success, dependency timeout, diagnostics and independent liveness. Ephemeral Staging checks catalog and dashboard during an uncached readiness burst against disposable PG17 and verifies outage detection and recovery.

## Verification

- Before the fix, the burst test failed with 129 Ping calls and waiters blocked behind the probes. The synthetic operator test also failed against the baseline argv examples.
- Focused Node tests passed (2 tests). Stub argv contains only fixed flags and SQL path, with byte-identical CSV stdin, preserved TLS fields and nonsecret failures. The disposable PG17 import inserted one fixture row, preserved idempotency and rejected malformed CSV atomically.
- `go test -race ./internal/httpapi ./internal/postgres`, Go Quality, PostgreSQL Integration, Security, Ops and SQL regeneration passed in the isolated worktree. Initial local Go jobs selected Go 1.27.1 with automatic toolchain selection disabled. Re-running with the repository's Go 1.27.4 resolved that mismatch. Local staging initially hit Corepack's unpinned frontend fallback, with qualification using the CI pnpm 10.32.1 binary.
- CI and final archive verification are recorded in the paired final evidence report after publication so the report can name the exact commit it qualifies.

Frontend and Backend 2 require no API changes. Operators must use the new connection-variable names documented for their own workflow. No production credentials or database endpoints were used for tests.

`PRODUCTION_NOT_CHANGED` · `NOT_MERGED` · `NO_ROOT_APPROVAL`
