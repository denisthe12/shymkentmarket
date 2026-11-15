# GitHub branch protection — current state

## State on 2026-11-15 (checked through the GitHub API on 2026-11-11 and 2026-11-15)

- `main` has **no branch protection**: `GET repos/kiratonine/AdilBaga/branches/main/protection`
  returns 404.
- Rulesets are unavailable: the repository is private (since 2026-11-06) on the free
  plan, and the API answers 403 «Upgrade to GitHub Pro or make this repository public».
- Consequence: GitHub does not block a merge into `main` with a red or missing CI,
  without review, or a force push. Only team practice prevents it.
- Actual flow: feature branch → PR → `main`. The `integrate/full-stack` branch is not
  on the remote; recent PRs (#105–#109) target `main` directly.
- CI (`.github/workflows/ci.yml`) runs on every PR and push: Contracts, Go Quality,
  DB Schema, Frontend, Pipeline Quality, Security, PostgreSQL Integration, Ephemeral
  Staging, and the aggregate **CI Gate** (`always()`, fails if any mandatory job failed,
  was cancelled or skipped).
- Team rule until protection exists: merge into `main` only when CI Gate is green on
  the PR head; no force push to `main`; release SHAs come from exact-main CI
  (`deploy/README.md`).

## Target protection (needs GitHub Pro/Team or a public repository)

For `main`: require a PR, required check **CI Gate**, block force push and deletion,
require conversation resolution when compatible with the team workflow. Review the
bypass/admin policy separately so the owner is not locked out. Enable it only after
a successful CI Gate run on the latest `main`.

Dependabot proposes reviewed weekly updates, at most three open version-update PRs
per ecosystem, no blind major grouping and no auto-merge. Security updates must stay
visible.

History: the Part12 Phase A plan (2026-09) assumed a `integrate/full-stack` → release
PR → `main` flow; it is not used now.
