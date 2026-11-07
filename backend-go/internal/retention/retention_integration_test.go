//go:build integration

package retention

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"adilbaga/backend-go/internal/ingestion"

	"github.com/jackc/pgx/v5"
)

type snap struct {
	status    string
	published time.Time // zero => NULL
}

type env struct {
	ctx    context.Context
	admin  *pgx.Conn
	writer *pgx.Conn
	prefix string
}

// setup opens the owner and restricted-writer connections (local guard from the
// role test) and registers cleanup of every row whose id starts with the
// test-owned prefix.
func setup(t *testing.T, prefix string) *env {
	t.Helper()
	adminURL := os.Getenv("TEST_RETENTION_ADMIN_DATABASE_URL")
	writerURL := os.Getenv("TEST_RETENTION_WRITER_DATABASE_URL")
	if adminURL == "" && writerURL == "" {
		t.Skip("explicit disposable part13_retention profile required")
	}
	if !localTarget(adminURL, "postgres") || !localTarget(writerURL, "part13_retention_login") {
		t.Fatal("dedicated loopback part13_retention owner and restricted login required")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	t.Cleanup(cancel)
	connect := func(value string) *pgx.Conn {
		c, err := pgx.Connect(ctx, value)
		if err != nil {
			t.Fatal("local connection unavailable")
		}
		t.Cleanup(func() { _ = c.Close(context.Background()) })
		return c
	}
	e := &env{ctx: ctx, admin: connect(adminURL), writer: connect(writerURL), prefix: prefix}
	e.cleanup()
	t.Cleanup(e.cleanup)
	var foreign int
	if e.admin.QueryRow(ctx, `SELECT count(*) FROM public.snapshots WHERE status='published' AND id NOT LIKE $1`, prefix+"%").Scan(&foreign) != nil || foreign != 0 {
		t.Fatal("database must hold no published snapshots outside this test")
	}
	return e
}

func (e *env) cleanup() {
	bg := context.Background()
	like := e.prefix + "%"
	_, _ = e.admin.Exec(bg, `DROP TRIGGER IF EXISTS retention_test_fail ON public.source_runs`)
	_, _ = e.admin.Exec(bg, `DROP FUNCTION IF EXISTS public.retention_test_fail()`)
	for _, q := range []string{
		// price_history has FK RESTRICT to canonical_products and stores, and Apply writes it.
		`DELETE FROM public.price_history WHERE "canonicalProductId" LIKE $1`,
		`DELETE FROM public.offers WHERE "snapshotId" LIKE $1`,
		`DELETE FROM public.product_mappings WHERE "rawProductId" LIKE $1`,
		`DELETE FROM public.raw_products WHERE "snapshotId" LIKE $1`,
		`DELETE FROM public.source_runs WHERE "snapshotId" LIKE $1`,
		`DELETE FROM public.snapshots WHERE id LIKE $1`,
		`DELETE FROM public.stores WHERE id LIKE $1`,
		`DELETE FROM public.canonical_products WHERE id LIKE $1`,
		`DELETE FROM public.categories WHERE id LIKE $1`,
	} {
		_, _ = e.admin.Exec(bg, q, like)
	}
}

func (e *env) exec(t *testing.T, q string, args ...any) {
	t.Helper()
	if _, err := e.admin.Exec(e.ctx, q, args...); err != nil {
		t.Fatalf("fixture statement failed: %v", err)
	}
}

// seed creates snapshots <prefix>1..n (n = len(specs)); each gets 1 source run,
// 2 raw products, 2 mappings and 2 offers. Returns the snapshot ids.
func (e *env) seed(t *testing.T, specs []snap) []string {
	t.Helper()
	var store string
	if e.admin.QueryRow(e.ctx, `SELECT id FROM public.stores ORDER BY id LIMIT 1`).Scan(&store) != nil {
		t.Fatal("a seeded store row is required")
	}
	cat, canon := e.prefix+"cat", e.prefix+"canon"
	e.exec(t, `INSERT INTO public.categories(id,slug,name) VALUES($1,$1,$1)`, cat)
	e.exec(t, `INSERT INTO public.canonical_products(id,name,"categoryId") VALUES($1,$1,$2)`, canon, cat)
	var ids []string
	for i, s := range specs {
		id := fmt.Sprintf("%s%d", e.prefix, i+1)
		ids = append(ids, id)
		var pub any
		if !s.published.IsZero() {
			pub = s.published
		}
		e.exec(t, `INSERT INTO public.snapshots(id,status,"publishedAt") VALUES($1,$2::"SnapshotStatus",$3)`, id, s.status, pub)
		e.exec(t, `INSERT INTO public.source_runs(id,"snapshotId","storeId") VALUES($1,$2,$3)`, id+"-sr", id, store)
		for _, n := range []string{"a", "b"} {
			raw := id + "-r" + n
			e.exec(t, `INSERT INTO public.raw_products(id,"storeId","sourceProductId","rawName","rawPrice","snapshotId") VALUES($1,$2,$1,$1,1,$3)`, raw, store, id)
			e.exec(t, `INSERT INTO public.product_mappings(id,"rawProductId","canonicalProductId","matchMethod") VALUES($1,$2,$3,'manual')`, id+"-m"+n, raw, canon)
			e.exec(t, `INSERT INTO public.offers(id,"canonicalProductId","rawProductId","storeId",price,"snapshotId") VALUES($1,$2,$3,$4,1,$5)`, id+"-o"+n, canon, raw, store, id)
		}
	}
	return ids
}

type rows struct{ Snapshots, Offers, Mappings, Raw, Runs int }

func (e *env) rows(t *testing.T, id string) rows {
	t.Helper()
	var r rows
	err := e.admin.QueryRow(e.ctx, `SELECT
 (SELECT count(*) FROM public.snapshots WHERE id=$1),
 (SELECT count(*) FROM public.offers WHERE "snapshotId"=$1),
 (SELECT count(*) FROM public.product_mappings WHERE "rawProductId" LIKE $1||'-%'),
 (SELECT count(*) FROM public.raw_products WHERE "snapshotId"=$1),
 (SELECT count(*) FROM public.source_runs WHERE "snapshotId"=$1)`, id).Scan(&r.Snapshots, &r.Offers, &r.Mappings, &r.Raw, &r.Runs)
	if err != nil {
		t.Fatalf("count query failed: %v", err)
	}
	return r
}

func (e *env) canonicalCount(t *testing.T) int {
	t.Helper()
	var n int
	if e.admin.QueryRow(e.ctx, `SELECT count(*) FROM public.canonical_products`).Scan(&n) != nil {
		t.Fatal("canonical count failed")
	}
	return n
}

var (
	full  = rows{1, 2, 2, 2, 1}
	empty = rows{}
	base  = time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC)
)

func published(n int) []snap {
	var s []snap
	for i := 0; i < n; i++ {
		s = append(s, snap{"published", base.Add(time.Duration(i) * time.Hour)})
	}
	return s
}

func (e *env) pruner(t *testing.T, keep int) *Pruner {
	t.Helper()
	p, err := New(e.writer, keep)
	if err != nil {
		t.Fatal("pruner construction failed")
	}
	return p
}

func TestLocalRetentionDeletesOldest(t *testing.T) {
	e := setup(t, "ret4-del-")
	ids := e.seed(t, published(6))
	canonBefore := e.canonicalCount(t)
	rep, err := e.pruner(t, 4).Apply(e.ctx)
	if err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	want := Report{Kept: 4, Deleted: 2, Offers: 4, Mappings: 4, RawProducts: 4, SourceRuns: 2}
	if rep != want {
		t.Fatalf("report %+v, want %+v", rep, want)
	}
	for i, id := range ids {
		exp := full
		if i < 2 {
			exp = empty
		}
		if got := e.rows(t, id); got != exp {
			t.Fatalf("snapshot #%d rows %+v, want %+v", i+1, got, exp)
		}
	}
	if e.canonicalCount(t) != canonBefore {
		t.Fatal("canonical_products changed")
	}
	var locked bool
	if e.admin.QueryRow(e.ctx, `SELECT pg_try_advisory_lock($1)`, ingestion.AdvisoryLockKey).Scan(&locked) != nil || !locked {
		t.Fatal("advisory lock was not released")
	}
	_, _ = e.admin.Exec(e.ctx, `SELECT pg_advisory_unlock($1)`, ingestion.AdvisoryLockKey)
}

func TestLocalRetentionPlanIsReadOnly(t *testing.T) {
	e := setup(t, "ret4-plan-")
	ids := e.seed(t, published(6))
	e.capture(t, ids[0], e.stores(t)[0], time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC), "succeeded")
	rep, err := e.pruner(t, 4).Plan(e.ctx)
	if err != nil {
		t.Fatalf("plan failed: %v", err)
	}
	if rep.Deleted != 2 || rep.Kept != 4 || rep.History == 0 {
		t.Fatalf("report %+v", rep)
	}
	if got := e.historyRows(t); len(got) != 0 {
		t.Fatalf("plan wrote history: %+v", got)
	}
	for _, id := range ids {
		if got := e.rows(t, id); got != full {
			t.Fatalf("plan changed rows: %+v", got)
		}
	}
}

func TestLocalRetentionNoopWhenFewSnapshots(t *testing.T) {
	e := setup(t, "ret4-noop-")
	ids := e.seed(t, published(4))
	rep, err := e.pruner(t, 4).Apply(e.ctx)
	if err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	if rep != (Report{Kept: 4}) {
		t.Fatalf("report %+v", rep)
	}
	for _, id := range ids {
		if got := e.rows(t, id); got != full {
			t.Fatalf("rows changed: %+v", got)
		}
	}
}

func TestLocalRetentionKeepsUnpublished(t *testing.T) {
	e := setup(t, "ret4-unpub-")
	specs := []snap{{status: "building"}, {status: "validating"}, {status: "failed"}}
	specs = append(specs, published(6)...)
	ids := e.seed(t, specs)
	rep, err := e.pruner(t, 4).Apply(e.ctx)
	if err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	if rep.Deleted != 2 || rep.Kept != 4 {
		t.Fatalf("report %+v", rep)
	}
	for i, id := range ids {
		exp := full
		if i == 3 || i == 4 { // two oldest published
			exp = empty
		}
		if got := e.rows(t, id); got != exp {
			t.Fatalf("snapshot #%d rows %+v, want %+v", i+1, got, exp)
		}
	}
}

func TestLocalRetentionRefusesWhileIngestRuns(t *testing.T) {
	e := setup(t, "ret4-lock-")
	ids := e.seed(t, published(6))
	holder, err := pgx.Connect(e.ctx, os.Getenv("TEST_RETENTION_ADMIN_DATABASE_URL"))
	if err != nil {
		t.Fatal("local connection unavailable")
	}
	defer holder.Close(context.Background())
	var ok bool
	if holder.QueryRow(e.ctx, `SELECT pg_try_advisory_lock($1)`, ingestion.AdvisoryLockKey).Scan(&ok) != nil || !ok {
		t.Fatal("could not hold ingest lock")
	}
	_, err = e.pruner(t, 4).Apply(e.ctx)
	if err == nil || err.Error() != "ingestion already running" {
		t.Fatalf("expected ingestion already running, got %v", err)
	}
	for _, id := range ids {
		if got := e.rows(t, id); got != full {
			t.Fatalf("rows changed while locked: %+v", got)
		}
	}
}

func TestLocalRetentionResumesAfterFailure(t *testing.T) {
	e := setup(t, "ret4-resume-")
	ids := e.seed(t, published(6))
	// Candidates are ids[0] (oldest) and ids[1]; fail the second one.
	e.exec(t, `CREATE FUNCTION public.retention_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$`)
	e.exec(t, fmt.Sprintf(`CREATE TRIGGER retention_test_fail BEFORE DELETE ON public.source_runs FOR EACH ROW WHEN (OLD."snapshotId" = %s) EXECUTE FUNCTION public.retention_test_fail()`, quote(ids[1])))
	rep, err := e.pruner(t, 4).Apply(e.ctx)
	if err == nil {
		t.Fatal("expected failure")
	}
	if strings.Contains(err.Error(), ids[1]) || strings.Contains(err.Error(), "injected") {
		t.Fatal("error leaks details")
	}
	if rep.Deleted != 1 {
		t.Fatalf("partial report %+v", rep)
	}
	if got := e.rows(t, ids[0]); got != empty {
		t.Fatalf("first candidate not fully deleted: %+v", got)
	}
	if got := e.rows(t, ids[1]); got != full {
		t.Fatalf("second candidate not intact: %+v", got)
	}
	e.exec(t, `DROP TRIGGER retention_test_fail ON public.source_runs`)
	rep, err = e.pruner(t, 4).Apply(e.ctx)
	if err != nil {
		t.Fatalf("resume failed: %v", err)
	}
	if rep.Deleted != 1 || rep.Kept != 4 {
		t.Fatalf("resume report %+v", rep)
	}
	if got := e.rows(t, ids[1]); got != empty {
		t.Fatalf("second candidate not deleted on resume: %+v", got)
	}
}

func quote(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
