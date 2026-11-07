package retention

import (
	"context"
	"errors"
)

// historyRowsSQL selects the price_history rows that are still missing: for every
// store and month (Asia/Aqtau) the offers of that store's first successful capture.
// A (month, store) that already has rows is never selected again, so a month is
// written once and never changes.
const historyRowsSQL = `WITH firsts AS (
  SELECT DISTINCT ON (x."storeId", m.month)
         x."storeId", x."snapshotId", x."capturedAt", m.month
  FROM public.source_runs x
  JOIN public.snapshots s ON s.id=x."snapshotId"
  CROSS JOIN LATERAL (
    SELECT date_trunc('month', x."capturedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Aqtau')::date AS month
  ) m
  WHERE s.status='published' AND s."publishedAt" IS NOT NULL
    AND x.status='succeeded' AND x."capturedAt" IS NOT NULL
  ORDER BY x."storeId", m.month, x."capturedAt", s."publishedAt", s.id
)
SELECT f.month, o."storeId", o."canonicalProductId", r."sourceProductId", r."rawName",
       o.price, o."oldPrice", pm."reviewStatus", f."capturedAt", f."snapshotId"
FROM firsts f
JOIN public.offers o ON o."snapshotId"=f."snapshotId" AND o."storeId"=f."storeId"
JOIN public.raw_products r ON r.id=o."rawProductId"
JOIN public.product_mappings pm ON pm."rawProductId"=r.id AND pm."canonicalProductId"=o."canonicalProductId"
WHERE NOT EXISTS (
  SELECT 1 FROM public.price_history h WHERE h.month=f.month AND h."storeId"=f."storeId"
)`

const archiveSQL = `INSERT INTO public.price_history
 (month,"storeId","canonicalProductId","sourceProductId","rawName",price,"oldPrice","reviewStatus","capturedAt","snapshotId") ` +
	historyRowsSQL + ` ON CONFLICT DO NOTHING`

const historyCountSQL = `SELECT count(*) FROM (` + historyRowsSQL + `) missing`

// archive records the monthly prices that are not yet in price_history and
// returns the number of rows written. The caller must hold the advisory lock and
// must not delete anything when it fails.
func (p *Pruner) archive(ctx context.Context) (int64, error) {
	tag, err := p.conn.Exec(ctx, archiveSQL)
	if err != nil {
		return 0, errors.New("retention history failed")
	}
	return tag.RowsAffected(), nil
}

// pendingHistory is the read-only counterpart of archive.
func (p *Pruner) pendingHistory(ctx context.Context) (int64, error) {
	var n int64
	if p.conn.QueryRow(ctx, historyCountSQL).Scan(&n) != nil {
		return 0, errors.New("retention history failed")
	}
	return n, nil
}
