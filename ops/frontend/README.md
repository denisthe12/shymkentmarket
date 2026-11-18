# Frontend cache flush

> **Aktau legacy/reference — NOT Shymkent operating instructions.** Endpoint, ключи и команды ниже относятся к Актау. Для работы над Шымкентом используйте [общий onboarding](../../docs/developer-onboarding.md).

The frontend server caches API responses for up to an hour
(`next: { revalidate: 3600, tags: ['catalog-data'] }`, `frontend/src/api/httpAdapter.ts`).
Ingest flushes that cache after every snapshot publication. An API release that changes
data (new groups, changed rules) needs the same flush, otherwise pages keep the old answer.

`revalidate_frontend.py` sends the same signed event as ingest
(`backend-go/internal/revalidation/client.go`) to `POST /internal/revalidate`:

- reads `FRONTEND_REVALIDATE_URL`, `REVALIDATE_HMAC_SECRET` and `APP_ENV` from
  `/etc/aktau-sync.env` (or `--env-file PATH`); only root and the sync user can read it;
- prints one line `REVALIDATE_PASS host=… status=204` or `REVALIDATE_FAIL <reason>`;
  never prints the secret, headers or response body; exit 0 only on HTTP 204;
- Python stdlib only; no redirects; https only in production.

Install on the VPS (root-owned, from a reviewed checkout of `main`):

```bash
sudo install -o root -g root -m 0755 revalidate_frontend.py /usr/local/sbin/adilbaga-revalidate-frontend
sudo python3 -I -B /usr/local/sbin/adilbaga-revalidate-frontend
```

When to run: after `RESULT=CUTOVER_PASS` of an API release, and after an API rollback.
See `deploy/README.md` «Frontend cache flush». Tests: `run-checks.mjs security`.

## Production VPS

See the [Frontend VPS runbook](../../docs/production/FRONTEND_VPS_DEPLOYMENT.md) for the deployment and rollback procedure and the [release inventory](../../deploy/README.md#current-release) for running revisions. The 2026-11-17 manual release verified one signed flush with HTTP 204. The tracked script is the source for the installed helper.
