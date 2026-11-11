# API unavailable

## LOCAL NOW

Symptoms: connection failure, unhealthy container, repeated 5xx. Probe the
known local origin's /health/live (process) and /health/ready (DB/runtime ability).
live200/ready503 is dependency degradation, not proof of process death. Use
RTK curl and inspect only your owned process/container. Read structured JSON
logs by request_id, route template and bounded error_code; do not dump env,
request bodies or container Env. Reproduce locally with private loopback config.

Check numeric pool/query failure signals and [db-down](db-down.md) before any
restart. Redis/Gemini outages do not invalidate catalog readiness. Preserve
logs safely without sensitive payloads. For a regression in a known immutable
app revision, follow [rollback](rollback.md); never fix API availability by
changing RLS/schema, running seed/migrations or switching to owner DB credentials.
Recovery: live200, ready200, frozen GET smoke and controlled Voice flow; no new
5xx and bounded latency. An unavailable backend alone is not DB loss.

## VPS — production Go API

Host cloudflared → loopback Docker API; Supabase restricted identity only.
Active release and rollback target: [deploy/README.md](../../deploy/README.md)
→ «Current release». New releases require exact-SHA CI and an off-VPS immutable
image; never hot-fix dependencies/runtime on VPS. A regression in the new release
→ [rollback](rollback.md) to the prior image.

External check: `aktau-go-monitor.timer` probes the public API every 5 minutes
and sends ALERT/RECOVERED to Telegram ([ops/monitor](../../ops/monitor/README.md)).
A silent monitor is visible in the daily sync report (18:30 Aktau).
Provider-perfect availability is superseded: require correct application Voice/
session flows through Gemini success OR approved deterministic fallback.

```bash
ssh my-vps 'sudo systemctl is-active docker cloudflared'
ssh my-vps 'sudo docker compose --env-file /etc/adilbaga/release.env -f /opt/adilbaga/compose.production.yml ps'
ssh my-vps 'curl -fsS http://127.0.0.1:8080/health/live; curl -fsS http://127.0.0.1:8080/health/ready'
```

After separately approved recovery, require running/healthy/restart0, loopback
publication, real Voice/session smoke and then public health through Tunnel.
Recreate command is documented in deploy/README; close public traffic first.
Inspect logs privately, output fixed error/provider classes only, never raw env,
voice text/coordinates/session IDs. Disk/memory alerts are not configured.

Use curl or a clearly identified operator client for edge diagnostics. Generic
Python-urllib currently gets Cloudflare1010/403 despite healthy origin, not proof
of DB/process failure. Do not impersonate a browser or weaken WAF automatically;
review edge policy separately if a required actual client is affected.
Physical Siri remains NOT RUN.
