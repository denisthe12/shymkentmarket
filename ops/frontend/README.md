# Frontend cache flush

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

## Observed VPS release — 2026-11-17

Frontend source `34654678857ceabf6d68f968eac2c586dcb88909`, Next16.4.5, BUILD_ID `GzGLeOMZnFUIglDm2u-Dn`. Existing `/opt/aktau-market-frontend/compose.yaml` selects its immutable SHA tag; runtime.env/token stay protected in place. Prior image `a04bee643470753fd0874bc1b53d740a4593e618` and root-private compose backup `/var/backups/aktau-manual-combined-20261117T182318Z` retained. Existing frontend connector/DNS unchanged. Follow shared deployment lock and per-component rollback; wait Docker healthy as well as HTTP readiness. Details: `docs/production/FRONTEND_VPS_DEPLOYMENT.md`. The standalone deployment overlay is retained separately; do not overwrite newer application config with a historical whole config.
