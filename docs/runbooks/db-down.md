# PostgreSQL unavailable

## LOCAL NOW

Expected outage: live200, ready503; recovery must restore ready200 without API
restart. Begin with read-only diagnostics: provider availability, connect timeout,
pool acquired/idle/max, query failure histogram and fixed error classifications.
Check private credential target and effective restricted aktau_api_runtime
identity through approved read-only metadata; never print DSN/password/host.
Check connection exhaustion/session policy before assuming data corruption.

Do **not** switch API to owner/migration credentials, disable RLS, grant access,
rotate blindly, run migration as incident repair or execute production writes.
Transient outage is not grounds for restore. Restore is considered only after
confirmed data loss/corruption, owner-approved recovery point and external review.
First take a fresh private encrypted backup and prove restore/counts/fingerprints
in disposable loopback PG17 via [backup tooling](../../ops/postgres/README.md).
Production restore is a separate authorization, never this runbook's default.

Recovery: restricted pool session policy PASS, ready200, categories/products/
dashboard parity, data/history/security unchanged; API remains least privilege.

## VPS

The API and the sync units both use Supabase over the session pooler (the VPS has no
IPv6). A DB outage shows as API `ready` 503 (monitor ALERT in Telegram) and as sync
exit 1 (nothing published; the site keeps the previous snapshot). Supabase status and
the project dashboard are the first check. No managed DB alert delivery, pool dashboards
or scheduled backups are configured; recovery target is a reviewed decision, not this
runbook's default.
