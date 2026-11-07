//go:build integration

package retention

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

type hist struct {
	Month      string
	Store      string
	Canonical  string
	Price      int
	CapturedAt time.Time
	Snapshot   string
}

func day(m time.Month, d, h, min int) time.Time {
	return time.Date(2026, m, d, h, min, 0, 0, time.UTC)
}

// stores returns the seeded store that seed uses and a second, test-owned store
// (created on first call, removed by cleanup).
func (e *env) stores(t *testing.T) []string {
	t.Helper()
	var first string
	if e.admin.QueryRow(e.ctx, `SELECT id FROM public.stores WHERE id NOT LIKE $1 ORDER BY id LIMIT 1`, e.prefix+"%").Scan(&first) != nil {
		t.Fatal("a seeded store row is required")
	}
	second := e.prefix + "store2"
	e.exec(t, `INSERT INTO public.stores(id,code,name)
 SELECT $1,c,$1 FROM unnest(enum_range(NULL::"StoreCode")) c
 WHERE NOT EXISTS (SELECT 1 FROM public.stores WHERE code=c) AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id=$1) LIMIT 1`, second)
	var n int
	if e.admin.QueryRow(e.ctx, `SELECT count(*) FROM public.stores WHERE id=$1`, second).Scan(&n) != nil || n != 1 {
		t.Fatal("a free store code is required for the second test store")
	}
	return []string{first, second}
}

// capture sets (or creates) the source run of a snapshot and store.
func (e *env) capture(t *testing.T, snapshotID, store string, capturedAt time.Time, status string) {
	t.Helper()
	e.exec(t, `INSERT INTO public.source_runs(id,"snapshotId","storeId",status,"capturedAt") VALUES($1,$2,$3,$4::"SourceRunStatus",$5)
 ON CONFLICT ("snapshotId","storeId") DO UPDATE SET status=EXCLUDED.status,"capturedAt"=EXCLUDED."capturedAt"`,
		snapshotID+"-cap-"+store, snapshotID, store, status, capturedAt)
}

func (e *env) setPrice(t *testing.T, snapshotID string, price int) {
	t.Helper()
	e.exec(t, `UPDATE public.offers SET price=$2 WHERE "snapshotId"=$1`, snapshotID, price)
}

func (e *env) canonical(t *testing.T, name string) string {
	t.Helper()
	id := e.prefix + name
	e.exec(t, `INSERT INTO public.canonical_products(id,name,"categoryId") VALUES($1,$1,$2)`, id, e.prefix+"cat")
	return id
}

// addOffer adds one raw product, mapping and offer for a store in a snapshot.
func (e *env) addOffer(t *testing.T, snapshotID, store, canon, key string, price int) {
	t.Helper()
	raw := snapshotID + "-x" + key
	e.exec(t, `INSERT INTO public.raw_products(id,"storeId","sourceProductId","rawName","rawPrice","snapshotId") VALUES($1,$2,$1,$1,1,$3)`, raw, store, snapshotID)
	e.exec(t, `INSERT INTO public.product_mappings(id,"rawProductId","canonicalProductId","matchMethod") VALUES($1,$2,$3,'manual')`, raw+"-m", raw, canon)
	e.exec(t, `INSERT INTO public.offers(id,"canonicalProductId","rawProductId","storeId",price,"snapshotId") VALUES($1,$2,$3,$4,$5,$6)`, raw+"-o", canon, raw, store, price, snapshotID)
}

func (e *env) historyRows(t *testing.T) []hist {
	t.Helper()
	rs, err := e.admin.Query(e.ctx, `SELECT to_char(month,'YYYY-MM-DD'),"storeId","canonicalProductId",price,"capturedAt","snapshotId"
 FROM public.price_history WHERE "canonicalProductId" LIKE $1 ORDER BY month,"storeId","canonicalProductId"`, e.prefix+"%")
	if err != nil {
		t.Fatalf("history query failed: %v", err)
	}
	defer rs.Close()
	var out []hist
	for rs.Next() {
		var h hist
		if err := rs.Scan(&h.Month, &h.Store, &h.Canonical, &h.Price, &h.CapturedAt, &h.Snapshot); err != nil {
			t.Fatalf("history scan failed: %v", err)
		}
		out = append(out, h)
	}
	return out
}

func sameHistory(a, b []hist) bool {
	return fmt.Sprintf("%+v", a) == fmt.Sprintf("%+v", b)
}

func wantRow(t *testing.T, got hist, month, store string, price int, at time.Time, snapshot string) {
	t.Helper()
	if got.Month != month || got.Store != store || got.Price != price || !got.CapturedAt.Equal(at) || got.Snapshot != snapshot {
		t.Fatalf("history row %+v, want month=%s store=%s price=%d capturedAt=%s snapshot=%s", got, month, store, price, at, snapshot)
	}
}

func TestLocalRetentionHistoryFirstCaptureOfMonth(t *testing.T) {
	e := setup(t, "ret4-hfirst-")
	ids := e.seed(t, published(2))
	s := e.stores(t)[0]
	e.capture(t, ids[0], s, day(11, 1, 10, 0), "succeeded")
	e.capture(t, ids[1], s, day(11, 2, 10, 0), "succeeded")
	e.setPrice(t, ids[0], 100)
	e.setPrice(t, ids[1], 200)
	rep, err := e.pruner(t, 4).Apply(e.ctx)
	if err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	got := e.historyRows(t)
	if len(got) != 1 || rep.History != 1 {
		t.Fatalf("rows %+v report %+v", got, rep)
	}
	wantRow(t, got[0], "2026-11-01", s, 100, day(11, 1, 10, 0), ids[0])
}

func TestLocalRetentionHistoryFallsBackWhenFirstMissing(t *testing.T) {
	e := setup(t, "ret4-hfall-")
	ids := e.seed(t, published(1))
	s := e.stores(t)[0]
	e.capture(t, ids[0], s, day(11, 3, 10, 0), "succeeded")
	if _, err := e.pruner(t, 4).Apply(e.ctx); err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	got := e.historyRows(t)
	if len(got) != 1 {
		t.Fatalf("rows %+v", got)
	}
	wantRow(t, got[0], "2026-11-01", s, 1, day(11, 3, 10, 0), ids[0])
}

func TestLocalRetentionHistorySkipsStaleCapture(t *testing.T) {
	e := setup(t, "ret4-hstale-")
	ids := e.seed(t, published(2))
	s := e.stores(t)[0]
	e.capture(t, ids[0], s, day(10, 31, 10, 0), "succeeded") // published 1 Nov, captured before the month
	e.capture(t, ids[1], s, day(11, 2, 10, 0), "succeeded")
	e.setPrice(t, ids[1], 250)
	if _, err := e.pruner(t, 4).Apply(e.ctx); err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	got := e.historyRows(t)
	if len(got) != 2 {
		t.Fatalf("rows %+v", got)
	}
	wantRow(t, got[0], "2026-10-01", s, 1, day(10, 31, 10, 0), ids[0])
	wantRow(t, got[1], "2026-11-01", s, 250, day(11, 2, 10, 0), ids[1])
}

func TestLocalRetentionHistoryIgnoresFailedCapture(t *testing.T) {
	e := setup(t, "ret4-hfail-")
	ids := e.seed(t, published(2))
	s := e.stores(t)[0]
	e.capture(t, ids[0], s, day(11, 1, 10, 0), "failed")
	e.capture(t, ids[1], s, day(11, 2, 10, 0), "succeeded")
	if _, err := e.pruner(t, 4).Apply(e.ctx); err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	got := e.historyRows(t)
	if len(got) != 1 {
		t.Fatalf("rows %+v", got)
	}
	wantRow(t, got[0], "2026-11-01", s, 1, day(11, 2, 10, 0), ids[1])
}

func TestLocalRetentionHistoryAddsLateStore(t *testing.T) {
	e := setup(t, "ret4-hlate-")
	ids := e.seed(t, published(4))
	st := e.stores(t)
	e.capture(t, ids[0], st[0], day(11, 1, 10, 0), "succeeded")
	e.capture(t, ids[1], st[0], day(11, 2, 10, 0), "succeeded")
	e.setPrice(t, ids[0], 100)
	if _, err := e.pruner(t, 4).Apply(e.ctx); err != nil {
		t.Fatalf("first apply failed: %v", err)
	}
	if got := e.historyRows(t); len(got) != 1 {
		t.Fatalf("rows after first run %+v", got)
	}
	e.capture(t, ids[2], st[0], day(11, 4, 10, 0), "succeeded")
	e.capture(t, ids[3], st[0], day(11, 5, 10, 0), "succeeded")
	e.capture(t, ids[3], st[1], day(11, 5, 10, 0), "succeeded")
	e.addOffer(t, ids[3], st[1], e.prefix+"canon", "late", 500)
	rep, err := e.pruner(t, 4).Apply(e.ctx)
	if err != nil {
		t.Fatalf("second apply failed: %v", err)
	}
	got := e.historyRows(t)
	if len(got) != 2 || rep.History != 1 {
		t.Fatalf("rows %+v report %+v", got, rep)
	}
	byStore := map[string]hist{got[0].Store: got[0], got[1].Store: got[1]}
	wantRow(t, byStore[st[0]], "2026-11-01", st[0], 100, day(11, 1, 10, 0), ids[0])
	wantRow(t, byStore[st[1]], "2026-11-01", st[1], 500, day(11, 5, 10, 0), ids[3])
}

func TestLocalRetentionHistoryUsesAqtauMonth(t *testing.T) {
	e := setup(t, "ret4-htz-")
	ids := e.seed(t, published(1))
	s := e.stores(t)[0]
	e.capture(t, ids[0], s, day(11, 30, 19, 30), "succeeded") // 00:30 on 1 Dec in Asia/Aqtau
	if _, err := e.pruner(t, 4).Apply(e.ctx); err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	got := e.historyRows(t)
	if len(got) != 1 {
		t.Fatalf("rows %+v", got)
	}
	wantRow(t, got[0], "2026-12-01", s, 1, day(11, 30, 19, 30), ids[0])
}

func TestLocalRetentionHistoryIsIdempotent(t *testing.T) {
	e := setup(t, "ret4-hidem-")
	ids := e.seed(t, published(3))
	s := e.stores(t)[0]
	e.capture(t, ids[0], s, day(11, 1, 10, 0), "succeeded")
	e.setPrice(t, ids[0], 100)
	if rep, err := e.pruner(t, 4).Apply(e.ctx); err != nil || rep.History != 1 {
		t.Fatalf("first apply: %+v %v", rep, err)
	}
	before := e.historyRows(t)
	e.capture(t, ids[1], s, day(11, 2, 10, 0), "succeeded")
	e.setPrice(t, ids[1], 999)
	e.addOffer(t, ids[1], s, e.canonical(t, "canon2"), "new", 777)
	rep, err := e.pruner(t, 4).Apply(e.ctx)
	if err != nil {
		t.Fatalf("second apply failed: %v", err)
	}
	if rep.History != 0 {
		t.Fatalf("report %+v", rep)
	}
	if after := e.historyRows(t); !sameHistory(before, after) {
		t.Fatalf("history changed: %+v -> %+v", before, after)
	}
}

func TestLocalRetentionHistorySurvivesPrune(t *testing.T) {
	e := setup(t, "ret4-hprune-")
	ids := e.seed(t, published(6))
	s := e.stores(t)[0]
	e.capture(t, ids[0], s, day(11, 1, 10, 0), "succeeded")
	rep, err := e.pruner(t, 4).Apply(e.ctx)
	if err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	if rep.Deleted != 2 || rep.History != 1 {
		t.Fatalf("report %+v", rep)
	}
	if got := e.rows(t, ids[0]); got != empty {
		t.Fatalf("snapshot not pruned: %+v", got)
	}
	got := e.historyRows(t)
	if len(got) != 1 {
		t.Fatalf("rows %+v", got)
	}
	wantRow(t, got[0], "2026-11-01", s, 1, day(11, 1, 10, 0), ids[0])
}

func TestLocalRetentionHistoryFailureStopsDeletes(t *testing.T) {
	e := setup(t, "ret4-hstop-")
	ids := e.seed(t, published(6))
	e.capture(t, ids[0], e.stores(t)[0], day(11, 1, 10, 0), "succeeded")
	e.exec(t, `REVOKE INSERT ON public.price_history FROM aktau_retention_writer`)
	t.Cleanup(func() {
		_, _ = e.admin.Exec(context.Background(), `GRANT INSERT ON public.price_history TO aktau_retention_writer`)
	})
	rep, err := e.pruner(t, 4).Apply(e.ctx)
	if err == nil {
		t.Fatal("expected history failure")
	}
	if strings.Contains(err.Error(), "permission") || strings.Contains(err.Error(), "price_history") {
		t.Fatalf("error leaks driver text: %v", err)
	}
	if rep.Deleted != 0 {
		t.Fatalf("report %+v", rep)
	}
	for _, id := range ids {
		if got := e.rows(t, id); got != full {
			t.Fatalf("rows changed after history failure: %+v", got)
		}
	}
}
