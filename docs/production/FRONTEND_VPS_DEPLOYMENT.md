# Frontend VPS deployment

Production traffic goes from Cloudflare at [aktau.market](https://aktau.market) through the dedicated Frontend Tunnel (systemd unit `cloudflared-frontend.service`) to Next.js standalone Docker on `127.0.0.1:3000`. Browser and SSR API calls use [api.aktau.market](https://api.aktau.market), the separate API Tunnel (`cloudflared.service`), and Go Docker on `127.0.0.1:8080`. Go reads PostgreSQL using the restricted runtime role. Production request handlers do not scrape stores. On 2026-11-18, an HTTPS GET to `www.aktau.market/` returned 308 to `https://aktau.market/`. Vercel is a historical origin and a potential manual fallback only after verification.

The [Current release section](../../deploy/README.md#current-release) records the active and prior images for both services. A docs merge advances main without changing runtime image revisions.

## Build and stage

From a clean checkout of fresh main, on a build machine with Node 24 and Docker, run:

```bash
git fetch origin main
node frontend/scripts/build-vps-image.mjs /path/to/local-build.env
```

The helper exports only committed Frontend files and passes five allowlisted public variables. Use production API mode `http`, both API URLs at `https://api.aktau.market`, canonical site URL `https://aktau.market`, and the approved GA/Yandex IDs. Changing those public values requires a rebuild. The server runtime env lives at `/opt/aktau-market-frontend/runtime.env` (root:root 0600). Keep runtime HMAC in that file and the [sync-side configuration](FRONTEND_REVALIDATION.md). Keep connector credentials in the separate root-private token file referenced by the unit template.

Set `SHA` to the verified full main commit with passing CI. Save `aktau-market-frontend:$SHA` with `docker save -o frontend-image.tar "aktau-market-frontend:$SHA"`. Record SHA256, revision, Linux/amd64, runtime user, layer diff IDs and BUILD_ID. Transfer the exact archive using SSH, verify its SHA256 before `sudo -n docker load -i /path/to/frontend-image.tar`, then compare portable image metadata and layers. Keep the existing image.

## Activate and verify

Use the existing administrative `ssh my-vps` and hold `/var/lib/adilbaga/deploy/lock` from preflight through postflight or rollback. Check sync is idle and avoid 01:00 UTC, 13:00 UTC and Sunday 22:00 UTC sync windows. Retain the previous Compose bytes and image identity in a root-private backup. For first-time provisioning, install the tracked Cloudflare unit template using the existing protected token file and independently verified Tunnel routing. Routine releases keep the existing unit and connector running.

Render the tracked `frontend/compose.vps.yaml` with the verified full `FRONTEND_RELEASE_SHA`, validating that the only difference from the live service is the intended image reference. Use `docker compose -f /opt/aktau-market-frontend/compose.yaml config --quiet` and `docker compose -f /opt/aktau-market-frontend/compose.yaml up -d --no-deps frontend` through the existing admin access. Require loopback HTTP success and Docker healthy within a bounded startup window, with zero restarts and no OOM. Allow bounded edge propagation before full public smoke. Compare live container BUILD_ID and public Next JS bytes against the image. Check RU/KK catalog, search, filters, product, dashboard, map, baskets, images, canonical links, and health. Verify signed cache flush via the [existing helper](../../ops/frontend/README.md) when indicated by the release runbook.

If a critical check fails, restore the saved exact Compose reference under the same lock, recreate only Frontend, and repeat health and public smoke. For a coordinated release follow the [Go runbook](../../deploy/README.md) and qualify API before Frontend. AUTO_DEPLOY is disabled. The historical broker lifecycle issue remains separate from manual operations.

The 2026-11-17 release observed sitemap HTTP 200 at 7.48 MB in 21.8 s. Analytics startup was checked with intercepted loaders and delivery remains unverified. Cloudflare Insights may emit a CSP warning. These are dated observations.
