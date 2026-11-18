# Recovery / rollback boundaries

> **INHERITED_REFERENCE — Aktau operations.** The VPS steps, release and migration examples below belong to Aktau. Do not execute them for Shymkent. See [Shymkent staging and release boundaries](../production/STAGING_PLAN.md).

## General rules (local and VPS)

Identify which class failed before changing state:

1. **Application:** select a reviewed immutable prior binary/image; validate
   locally against current schema/contracts, then externally review rollout.
2. **Migration:** do not blindly reverse applied migrations or alter Prisma
   history. Fresh encrypted backup and disposable PG17 recovery proof first;
   separately reviewed schema reconciliation is required.
3. **Snapshot:** keep previous published snapshot readable; inspect failed staged
   history/atomicity read-only. No destructive DB rewind or history deletion to
   hide a failure. Publishing/recovery is separately authorized.
4. **Credential:** preserve restricted role semantics; verify replacement before
   revoke when supported. Never restore an owner credential to API runtime.

For suspected DB loss: [backup/restore tooling](../../ops/postgres/README.md),
choose an explicit recovery point, compare all counts/fingerprints/schema/history/
security and local restricted Go smoke. Restore only an owned loopback target
until owner separately approves production recovery. Take a fresh backup before
any destructive recovery; preserve existing backups and audit evidence.

## VPS — prior-image rollback

Active release and rollback target: `deploy/README.md` → «Current release»
(this runbook does not copy SHAs). Several prior SHA images are kept on the VPS,
so the normal rollback is switching `release.env` to the rollback target and
recreating the container: `deploy/README.md` → «Rollback». No database rollback;
check schema compatibility of the target before switching.

After the rollback, once Tunnel is back, flush the frontend cache
(`sudo python3 -I -B /usr/local/sbin/adilbaga-revalidate-frontend`, expect
`REVALIDATE_PASS … status=204`; `deploy/README.md` → «Frontend cache flush»).
Otherwise the site keeps showing the rolled-back release's answers for up to an hour.
A failed flush does not undo the rollback; retry it or wait for the 3600 s TTL.

A correctly handled Gemini failure alone is not a rollback trigger;
application/security/network failures are. Never expose origin as emergency
fallback, switch to owner credentials, mutate schema/history or rewind snapshots.
Recovery needs local health/smoke before Tunnel start.

Last resort, only when no kept image is healthy: Part14B zero-application state
(`deploy/README.md` → «Emergency stop»). The site is down until a reviewed recovery.
History: zero-application rollbacks were used during the first Part15 attempts
(no prior image existed then); see the Part15 report.

## Products-discovery hotfix rollback — 2026-10-08 (historical)

The reviewed `d6098f622dc5bb18fd9e7ec4f4a0c82033927981` application release made
no schema/data change. A public Voice HTTP500 triggered the authorized prior-image
rollback: stop Tunnel, restore the preserved SHA image reference to
`e6ef854e2973e5b0871888bbc3111e026cdccc5b`, recreate with the unchanged reviewed
compose/private runtime env, require bounded readiness200, then restart Tunnel.
This rollback completed; the old release is healthy and both images remain.
Restricted READ-ONLY POST audit matched the PRE counts/fingerprints/security.
No database rollback, grants, credentials, provider config or snapshot changed.
Do not automatically retry the new image or infer the HTTP500 root cause from
this observation. Further diagnosis/remediation requires external review.
