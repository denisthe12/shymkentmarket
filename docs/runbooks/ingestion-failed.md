# Ingestion (sync) failed

## LOCAL NOW

Inspect safe ingestion_complete mode/phase/error_code/duration and counts, then
operator-only snapshot/SourceRun state using scoped read-only diagnostics.
Never log raw source products/payloads or use API credential for history. A failed
staged snapshot must not replace the previous published snapshot: verify latest
published identity, counts, filters/dashboard/Voice remain from the old publish.

Before any separately approved apply, dry-run the prepared bundle, check drop/
quality/fingerprint/stable canonical identity gates and advisory-lock availability.
Do not forcibly release another process's lock or re-publish partial data. Publish
is atomic; a failed staged snapshot stays non-public until an explicitly reviewed
recovery action. Usually recovery means **keep previous published snapshot**, not
rewind DB/delete history. Follow [rollback](rollback.md) for confirmed corruption.

Local work uses only disposable lifecycle tests; never point a local run at
production credentials.

## VPS — scheduled sync

Ingestion runs on the VPS as systemd timers (`ops/sync/README.md`):
`aktau-sync.timer` 01:00/13:00 UTC (scrape four stores → sync → ingest → publish →
retention), `aktau-sync-full.timer` Sunday 22:00 UTC (full scrape, no publish).
A failed run shows up three ways: the unit is `failed`, the daily Telegram report
at 13:30 UTC flags the run (`ops/monitor/README.md`), and the journal has
`[sync] <store> exit=<code>`.

```bash
systemctl status aktau-sync.service --no-pager
sudo journalctl -u aktau-sync.service --since "-1 day" --no-pager -o short-iso | grep -E '\[sync\]|retention_complete'
sudo ls -lt /var/lib/aktau-sync/runs | head
```

Exit codes (full table: `docs/data/SYNC_RUNBOOK.md` §4):

- `0` — published, all stores fresh.
- `1` — sync/ingest failed or all scrapers failed: **nothing published**, the site
  keeps the previous snapshot.
- `3` — published, but stores in `[sync] stale stores: …` came from their last good
  file; fix the scraper before `SYNC_MAX_SOURCE_AGE_HOURS` (36 h) runs out.
- `4` — published, retention (`cmd/prune` or `price_history`) failed; prices are
  current, old snapshots accumulate until `RETENTION_DATABASE_URL`/role is fixed.

Do not start a manual sync during a scheduled window (01:00, 13:00, Sunday 22:00 UTC).
Never add a parser cron or change the timers as an incident fix; code updates go
through the checkout procedure in `ops/sync/README.md`.
