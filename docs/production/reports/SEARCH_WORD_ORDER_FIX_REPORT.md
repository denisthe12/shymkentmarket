# Go product search: word order fix — 2026-11-07

Status: source ready for independent review; deployed=NO. PR NOT MERGED. Base main: 4d8e3c0c36819dd4f277935a4ef541fbe5ac081a. Branch: fix/go-search-word-order. Exact final commit is the HEAD containing this report (git rev-parse HEAD); publication identifiers are recorded below/final handoff, not a self-referential commit hash.

## RCA and implementation

Frontend handoff §6 matches actual SQL: $2 was a complete name-only ILIKE phrase; brand was ignored. Use strings.Fields (Unicode whitespace), escaped literal substring patterns parameterized as $2::text[]. NOT EXISTS rejects a product if any token matches neither name nor coalesce(brand,''). Explicit PostgreSQL backslash ESCAPE; escape backslash before percent/underscore, then add only the two intended substring wildcards. No input interpolated into SQL.

All tokens AND, fields OR; no concatenated field-boundary match. Empty tokens mean no search predicate. Same shared query covers list and ID lookup. There is no separate count query/total DTO. Snapshot isolation, category/dynamic filters, offer eligibility, sorting/ICU tie breaks, pagination, DTOs and API unchanged. No frontend, pipeline, schema or migration changes.

Files: backend-go/internal/postgres/products.go (implementation); search_test.go (unit); plans_test.go (EXPLAIN arguments now arrays); backend-go/tests/integration/catalog_test.go (actual restricted-reader fixture queries); this report.

## Reproduction and tests

- Fail-first unit before helper: compile FAIL undefined searchPatterns (exit1). Initial PATH Go1.27.1 refused go.mod; selected already installed Go1.27.3 with GOTOOLCHAIN=local, no dependency/toolchain changes.
- Exact original products.go with new PG regressions: exit1, wrong name/brand/token-order and wildcard results. Fixed bytes restored in finally; no assertions disabled. Baseline fixture deliberately splits Russian name/Latin brand; original name-only search misses both multiword orders.
- Fixed PG17 focused TestDeterministicCatalog: exit0,35 PASS markers including parent/subtests,0SKIP. Both orders/case/Unicode whitespace/brand/null/all-tokens/empty/literal percent underscore backslash/injection/filter/pagination covered. Fixture updates are disposable-only and restored before original catalog assertions.
- go test ./...; go test -race ./internal/postgres/...; go vet ./...; go vet -tags=integration ./...: exit0.
- node scripts/ci/run-checks.mjs go: exit0, full race tests/vet/staticcheck ordinary+integration/govulncheck/API+ingest+prune builds PASS.
- node scripts/ci/run-checks.mjs security: exit0, tracked-secret/workflow guards and synthetic backup checks PASS.
- Full node scripts/ci/run-db-integration.mjs initially FAIL: EXPLAIN fixtures passed old string $2 after SQL array change. Fixed only those seven test arguments using searchPatterns; no assertions removed. Final run recorded in publication addendum.
- gofmt changed Go files; git diff --check exit0.

Node24.10.0, Go1.27.3, existing disposable loopback PG17 harness; no production DSN/env used. Logs retained off-tree /tmp/search-pg-baseline.log, search-pg-final.log, search-pg-regressions.log, search-pg-regressions-final.log, search-go-checks.log, search-security.log. Missing external/clone-specific integration tests outside existing harness are NOT_RUN; no full production/staging dataset qualification claimed. Real HTTP search assertions were subsequently added to the staging parity suite; see follow-up below.

## Risks and release boundary

ILIKE substring matching remains scan-based; per-token predicate work grows with tokens. No performance SLA or production-sized benchmark claimed. Brand matches and literal wildcards intentionally change search behavior; no other public contract changed. No index/migration/full-text engine added. Existing EXPLAIN suite retained. Hosted exact-head CI initially PENDING; do not interpret local PASS as hosted PASS. Review CI on exact PR HEAD before merging. NO DEPLOY / DO NOT MERGE BEFORE REVIEW.

## Publication addendum

PR: https://github.com/kiratonine/AdilBaga/pull/103 (ordinary review PR, not merged). Implementation commit: d5ce0b0528aa2bb382c28347ecaefdcb2f7fb1a9. A report-only follow-up records these identifiers; exact final HEAD is supplied in the delivery.

Final full PG17 harness exit0:103PASS markers (parent/subtests),0SKIP; includes deterministic catalog, pool/security/EXPLAIN/observability, ingestion batching, snapshot security, retention and identity regressions. Earlier failed run retained; affected EXPLAIN cases now all PASS. Hosted exact-head CI is PENDING at this report commit; authoritative final results are available in PR checks and final delivery. Never treat this snapshot as hosted CI PASS.

## Hosted parity failure and correction

Run42403138651 on63e1aa9 completed7SUCCESS/2FAIL (Ephemeral Staging and dependent CI Gate). Exact failure was HTTPParity search `%`: legacy Nest wildcard output was incorrectly treated as the required oracle for newly specified literal Go search. Full failed log: /tmp/search-ci-failure.log. No runtime fix was reverted and no case skipped.

backend-go/tests/integration/http_parity_test.go now derives expected search results independently from the unsearched reference catalog using literal Unicode-whitespace AND tokens across name/brand. Every prior wildcard/injection case remains checked; added reversed name words/brand words/blank input. Exact complete DTO array and order remain compared, including pagination; all non-search Nest parity checks unchanged. This is an intentional search-semantic divergence from the unmodified reference implementation, not a wire-contract change. Final changed scope is six files including this HTTP test.

Local node scripts/ci/run-ephemeral-staging.mjs exit0: real HTTP search cases PASS, Voice/security parity PASS, frontend E2E14passed/6existing skipped, Nest unit18passed/4existing skipped, Docker nonroot/readonly/DB outage+recovery checks PASS. Skips are existing non-search environment/fixture gates, not suppressed search regressions. go vet -tags=integration ./... exit0 after test update. Full log /tmp/search-staging-final.log. New exact-head hosted qualification pending on this follow-up; previous failed run is preserved, not represented as PASS.
