# API v1 contract tooling

`openapi.yaml` is the frozen wire-contract source of truth (OpenAPI 3.1.0,
version 1.0.0). See [API_V1_CONTRACT.md](../docs/production/API_V1_CONTRACT.md).
This is a separate pnpm package, not a root workspace or generated SDK.
Use Node 24.10.0 and pnpm 10.32.1. Linter/validators have exact versions and lockfile.

```bash
cd contracts
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

Offline tests validate nine small stable JSON examples (`examples/`, including the two
SZPT examples) using AJV 2020 + formats, and enforce selected contract invariants.
HTTP tests are skipped without a base URL. Examples come from explicit fixtures,
never production dumps. Fixture addresses are marked demo; coordinates are synthetic,
not owner location. The illustrative session ID is not a usable token. External
example files are linked from OpenAPI and checked by the offline suite.

## Reference/fixture profile — no server to run it against

`CONTRACT_PROFILE=fixture` expects an API that serves exactly the data of `examples/`:
it compares the first products page, one product and the dashboard with the examples
and runs the fixture voice POST tests (direct/list/empty results, coordinate strings,
clarification/continue, completed and unknown sessions, invalid DTOs). That server was
the legacy NestJS backend with `DATA_SOURCE=fixture`; it was removed with NestJS
(PR #106/#107), and the Go API has no fixture data source. The profile stays in the
suite for a future fixture server:

```bash
cd contracts
CONTRACT_API_BASE_URL=<fixture server origin> pnpm test:fixture
```

Until then the Go wire format is pinned by the recorded reference responses in
`backend-go/tests/integration/testdata/reference` (Ephemeral Staging CI job, see
«Recorded reference» in [backend-go/README.md](../backend-go/README.md)) and by the
offline suite above.

## Live read-only profile

Start the Go API (`backend-go`, `PORT=3000` as in the root README) with its private
local env. Then:

```bash
cd contracts
CONTRACT_API_BASE_URL=http://127.0.0.1:3000 pnpm test:live
```

This profile issues **GET only**; POST is explicitly prohibited by its helper.
It discovers categories/filter options/product IDs and SZPT groups at runtime; no
live dataset count, price, SKU or location is hardcoded. Only `CONTRACT_API_BASE_URL`
changes between targets. It never runs SQL, import, seed or migration. Logs include
only test names, schema paths and safe aggregate counts. Live voice and physical Siri
are not claimed by this profile.

429/500/503 envelopes are checked offline. We do not provoke production dependency
failures or claim a live 429 check: the API has a per-client rate limiter
(`RATE_LIMIT_RPS`/`RATE_LIMIT_BURST`), but the suite does not trigger it.
Numeric-string coordinate range is a runtime semantic check (JSON Schema cannot
apply numeric bounds to a string); the string schema documents this limitation.

Redocly recommended rules plus invalid schema/media examples are enabled. The
license rule is disabled because no API license has been selected, not to invent one.
