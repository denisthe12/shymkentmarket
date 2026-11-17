# Snapshot publication → frontend revalidation

> Приёмка C2 (сходимость за 5 секунд, наблюдатель и ledger) отменена решением команды 2026-11-05. Webhook инвалидации остаётся. Страховка при сбое уведомления: TTL кэша 3600 секунд.
>
> **Когда шлётся событие (2026-11-15).** Автоматически — из `cmd/ingest` после каждой публикации snapshot в плановом sync (`aktau-sync.timer`, 01:00/13:00 UTC, секрет в `/etc/aktau-sync.env`). Вручную — после релиза или отката API, который меняет данные: хелпер `/usr/local/sbin/adilbaga-revalidate-frontend` ([ops/frontend](../../ops/frontend/README.md), `deploy/README.md` → «Frontend cache flush»). Он же — способ повторить событие после сбоя Frontend/сети.

## Wire and configuration

Server-only `REVALIDATE_HMAC_SECRET`: at least 32 random bytes of entropy,
privately provisioned at runtime via the root-private VPS file `/opt/aktau-market-frontend/runtime.env` and the sync env file `/etc/aktau-sync.env` (ingest). See [Frontend VPS deployment](FRONTEND_VPS_DEPLOYMENT.md).
Never use NEXT_PUBLIC, Git, reports or shell tracing for its value.
Ingestion-only `FRONTEND_REVALIDATE_URL=https://aktau.market/internal/revalidate`.
Examples live in frontend/.env.example and
backend-go/internal/revalidation/.env.example; API runtime does not require them.

POST exact UTF-8 body `{"event":"snapshot_published"}` to `/internal/revalidate`.
`X-Adilbaga-Timestamp` is Unix seconds. `X-Adilbaga-Signature` is `v1=` followed
by lowercase hex HMAC-SHA256 over timestamp + period + exact raw body bytes.
Timestamp skew/replay window is ±300 seconds; replay within that window is
idempotent. Authentication uses constant-time digest comparison. Body max128
bytes (stream counted, not trusting Content-Length). Missing/short server secret
503; bad/missing authentication or oversize body401; authenticated non-fixed body
or query400; success204; GET405. All POST outcomes are empty and require
Cache-Control: no-store. The automatically generated Next.js GET405 is an approved
exception to the no-store requirement; it does not perform revalidation.
No input logging.
There are no caller-selected tags, paths, product IDs or URLs.

## Cache strategy

See the [release inventory](../../deploy/README.md#current-release) for the deployed Next.js version.
Reuse server fetch tag `catalog-data` with
`revalidateTag('catalog-data', { expire: 0 })`, not stale-while-revalidate `max`
and not Server-Action-only updateTag. Explicit fixed
`revalidatePath('/[lang]/(site)/products/[id]', 'page')` invalidates generated product
ISR output for both languages. Catalog/dashboard/category are runtime rendered;
sitemap uses connection() and the same tagged API fetches. This is the intended
expiration strategy; it does **not guarantee strict first-response freshness**.
No unnecessary dynamic-route path invalidation.
Already open browser query caches are not pushed/refreshed by a webhook; new
server requests are the freshness boundary.

## Commit ordering and degraded outcome

Each cmd/ingest run validates notifier config **before connecting/staging** for
any --apply; production requires HTTPS, no userinfo/query/fragment, fixed endpoint
path and secret minimum length. Test/development HTTP is loopback-only.
Dry-run does not require notifier config and never sends HTTP.

Only after successful staged.Publish COMMIT, signed POST runs with a fresh5s
bounded context/client, no redirect following, fixed JSON and no other data.
No network is introduced into the ingestion transaction/package. Publication
failure never notifies. Notification success is structured `outcome_class=success`;
failure is `degraded`. Published data stays published: command publication success
remains exit0 (unless an independent summary-output error occurs). There is one
attempt per publication, no transaction retry, queue or automatic second snapshot
(the next scheduled sync publishes and notifies again).
The unchanged3600s fetch/ISR TTL is the safety fallback. A signed event can be
resent separately after network/Frontend recovery (the helper above); never rerun --apply solely to
invalidate frontend cache. No endpoint/provider response body or URL/secret is
included in notification errors/logging.

