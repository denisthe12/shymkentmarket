// Package retention removes old published price snapshots, keeping the newest N.
//
// Errors deliberately carry no driver text: database messages can include row
// values (names, ids), and this package must not leak them into logs.
package retention

import (
	"context"
	"errors"
	"time"

	"adilbaga/backend-go/internal/ingestion"

	"github.com/jackc/pgx/v5"
)

const (
	MinKeep     = 4
	DefaultKeep = 14
)

type Report struct {
	Kept, Deleted                             int
	Offers, Mappings, RawProducts, SourceRuns int64
	// History is the number of price_history rows written (Apply) or still to be written (Plan).
	History int64
}

type Pruner struct {
	conn *pgx.Conn
	keep int
}

func New(conn *pgx.Conn, keep int) (*Pruner, error) {
	if conn == nil || keep < MinKeep {
		return nil, errors.New("retention configuration invalid")
	}
	return &Pruner{conn: conn, keep: keep}, nil
}

// Same ordering as latestSnapshotSQL in internal/postgres: newest first.
const publishedCountSQL = `SELECT count(*) FROM public.snapshots WHERE status='published' AND "publishedAt" IS NOT NULL`

// Candidates are every published snapshot after the newest $1, returned oldest first.
const candidatesSQL = `SELECT id FROM (
  SELECT id,"publishedAt" FROM public.snapshots
  WHERE status='published' AND "publishedAt" IS NOT NULL
  ORDER BY "publishedAt" DESC,id DESC OFFSET $1
) c ORDER BY "publishedAt" ASC,id ASC`

func (p *Pruner) kept(ctx context.Context) (int, int, error) {
	var total int
	if p.conn.QueryRow(ctx, publishedCountSQL).Scan(&total) != nil {
		return 0, 0, errors.New("retention count failed")
	}
	kept := total
	if kept > p.keep {
		kept = p.keep
	}
	return kept, total - kept, nil
}

// Plan only reads: Deleted is the number of candidate snapshots.
func (p *Pruner) Plan(ctx context.Context) (Report, error) {
	kept, candidates, err := p.kept(ctx)
	if err != nil {
		return Report{}, err
	}
	history, err := p.pendingHistory(ctx)
	if err != nil {
		return Report{}, err
	}
	return Report{Kept: kept, Deleted: candidates, History: history}, nil
}

func (p *Pruner) Apply(ctx context.Context) (Report, error) {
	if err := p.lock(ctx); err != nil {
		return Report{}, err
	}
	defer p.unlock()
	// kept and candidates agree only because the advisory lock is held.
	kept, _, err := p.kept(ctx)
	if err != nil {
		return Report{}, err
	}
	rep := Report{Kept: kept}
	// History first, under the same lock: a failure here deletes nothing.
	if rep.History, err = p.archive(ctx); err != nil {
		return Report{Kept: kept}, err
	}
	ids, err := p.candidates(ctx)
	if err != nil {
		return rep, err
	}
	for _, id := range ids {
		if err := p.deleteOne(ctx, id, &rep); err != nil {
			return rep, err
		}
	}
	return rep, nil
}

func (p *Pruner) candidates(ctx context.Context) ([]string, error) {
	rs, err := p.conn.Query(ctx, candidatesSQL, p.keep)
	if err != nil {
		return nil, errors.New("retention candidate query failed")
	}
	defer rs.Close()
	var ids []string
	for rs.Next() {
		var id string
		if rs.Scan(&id) != nil {
			return nil, errors.New("retention candidate scan failed")
		}
		ids = append(ids, id)
	}
	if rs.Err() != nil {
		return nil, errors.New("retention candidate query failed")
	}
	return ids, nil
}

// One transaction per snapshot. Offers are deleted explicitly first: there is
// no index on offers."rawProductId", so the cascade from raw_products would
// scan offers once per raw row.
func (p *Pruner) deleteOne(ctx context.Context, id string, rep *Report) error {
	tx, err := p.conn.Begin(ctx)
	if err != nil {
		return errors.New("retention transaction failed")
	}
	defer func() {
		rctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = tx.Rollback(rctx)
	}()
	steps := []struct {
		sql string
		dst *int64
	}{
		{`DELETE FROM public.offers WHERE "snapshotId"=$1`, &rep.Offers},
		{`DELETE FROM public.product_mappings WHERE "rawProductId" IN (SELECT id FROM public.raw_products WHERE "snapshotId"=$1)`, &rep.Mappings},
		{`DELETE FROM public.raw_products WHERE "snapshotId"=$1`, &rep.RawProducts},
		{`DELETE FROM public.source_runs WHERE "snapshotId"=$1`, &rep.SourceRuns},
	}
	counts := make([]int64, len(steps))
	for i, s := range steps {
		tag, err := tx.Exec(ctx, s.sql, id)
		if err != nil {
			return errors.New("retention delete failed")
		}
		counts[i] = tag.RowsAffected()
	}
	tag, err := tx.Exec(ctx, `DELETE FROM public.snapshots WHERE id=$1 AND status='published' AND "publishedAt" IS NOT NULL`, id)
	if err != nil || tag.RowsAffected() != 1 {
		return errors.New("retention delete failed")
	}
	if tx.Commit(ctx) != nil {
		return errors.New("retention commit failed")
	}
	for i, s := range steps {
		*s.dst += counts[i]
	}
	rep.Deleted++
	return nil
}

func (p *Pruner) lock(ctx context.Context) error {
	var ok bool
	if p.conn.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", ingestion.AdvisoryLockKey).Scan(&ok) != nil {
		return errors.New("ingestion lock unavailable")
	}
	if !ok {
		return errors.New("ingestion already running")
	}
	return nil
}

func (p *Pruner) unlock() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var released bool
	if p.conn.QueryRow(ctx, "SELECT pg_advisory_unlock($1)", ingestion.AdvisoryLockKey).Scan(&released) != nil || !released {
		_ = p.conn.Close(ctx)
	}
}
