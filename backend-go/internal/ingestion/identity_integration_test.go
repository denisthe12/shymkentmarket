//go:build integration

package ingestion

import (
	"context"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

const identityDatabase = "part14_identities"

func identityConn(t *testing.T, ctx context.Context, value string) *pgx.Conn {
	t.Helper()
	u, err := url.Parse(value)
	if err != nil || u.Path != "/"+identityDatabase || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") {
		t.Fatal("unsafe target")
	}
	conn, err := pgx.Connect(ctx, value)
	if err != nil {
		t.Fatal("local database unavailable")
	}
	t.Cleanup(func() { _ = conn.Close(context.Background()) })
	return conn
}

func identityBundle(ids ...RawProduct) Bundle {
	confidence := 1.0
	b := Bundle{Version: "1.0", GeneratedAt: "2026-11-07T12:00:00Z"}
	for _, p := range ids {
		b.RawProducts = append(b.RawProducts, p)
		b.Groups = append(b.Groups, Group{Name: p.Name, Category: "milk", Members: []Member{{Raw: p, Method: "deterministic", Confidence: &confidence, Review: "approved"}}})
	}
	return b
}

func TestLocalIdentityRegistry(t *testing.T) {
	adminURL, writerURL := os.Getenv("TEST_IDENTITY_ADMIN_DATABASE_URL"), os.Getenv("TEST_IDENTITY_WRITER_DATABASE_URL")
	if adminURL == "" || writerURL == "" {
		t.Skip("disposable identity database not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	admin, writer := identityConn(t, ctx, adminURL), identityConn(t, ctx, writerURL)
	for _, code := range stores {
		if _, err := admin.Exec(ctx, `INSERT INTO stores(id,code,name) VALUES($1,$2::"StoreCode",$1) ON CONFLICT(code) DO NOTHING`, "identity-"+code, code); err != nil {
			t.Fatal("store seed failed")
		}
	}
	engine, err := New(writer, 100, false)
	if err != nil {
		t.Fatal(err)
	}
	a, e, d, f, n := raw("DINA", "reg-a"), raw("DINA", "reg-e"), raw("DANA", "reg-d"), raw("FIX_PRICE", "reg-f"), raw("ANVAR", "reg-n")
	publish := func(b Bundle) Report {
		t.Helper()
		s, err := engine.Stage(ctx, b)
		if err != nil {
			t.Fatalf("stage: %v", err)
		}
		defer s.Close()
		if err := s.Publish(ctx); err != nil {
			t.Fatalf("publish: %v", err)
		}
		return s.Report
	}
	registered := func(p RawProduct) string {
		t.Helper()
		var id string
		if admin.QueryRow(ctx, `SELECT i."canonicalProductId" FROM product_identities i JOIN stores s ON s.id=i."storeId" WHERE s.code::text=$1 AND i."sourceProductId"=$2`, p.StoreCode, p.SourceProductID).Scan(&id) != nil {
			t.Fatalf("no registry row for %s", p.SourceProductID)
		}
		return id
	}
	fingerprint := func() string {
		t.Helper()
		var v string
		if admin.QueryRow(ctx, `SELECT md5(json_build_array((SELECT json_agg(r ORDER BY "storeId","sourceProductId") FROM product_identities r),(SELECT json_agg(r ORDER BY id) FROM snapshots r))::text)`).Scan(&v) != nil {
			t.Fatal("fingerprint unavailable")
		}
		return v
	}

	publish(identityBundle(a, e, d, f, n))
	var rows int
	if admin.QueryRow(ctx, `SELECT count(*) FROM product_identities`).Scan(&rows) != nil || rows != 5 {
		t.Fatalf("registry rows = %d, want 5", rows)
	}
	first := registered(a)

	publish(identityBundle(e, d, f, n))
	if registered(a) != first {
		t.Fatal("absent product lost its registry row")
	}

	before := fingerprint()
	report, err := engine.DryRun(ctx, identityBundle(a, e, d, f, n))
	if err != nil || report.RestoredCanonical != 1 || report.NewCanonical != 0 || fingerprint() != before {
		t.Fatalf("dry-run: %v %+v", err, report)
	}

	if report = publish(identityBundle(a, e, d, f, n)); report.NewCanonical != 0 || report.RestoredCanonical != 1 || registered(a) != first {
		t.Fatalf("returned product: %+v", report)
	}
	var live int
	if admin.QueryRow(ctx, `SELECT count(*) FROM offers o JOIN snapshots s ON s.id=o."snapshotId" WHERE o."canonicalProductId"=$1 AND s.status='published' AND s."publishedAt"=(SELECT max("publishedAt") FROM snapshots WHERE status='published')`, first).Scan(&live) != nil || live != 1 {
		t.Fatalf("offers on restored card = %d, want 1", live)
	}

	before = fingerprint()
	s, err := engine.Stage(ctx, identityBundle(a, e, d, f, n))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err = admin.Exec(ctx, `UPDATE snapshots SET status='building' WHERE id=$1`, s.id); err != nil {
		t.Fatal("status reset failed")
	}
	if s.Publish(ctx) == nil {
		t.Fatal("publication must fail after the status reset")
	}
	var seen int
	if admin.QueryRow(ctx, `SELECT count(*) FROM product_identities WHERE "lastSeenAt">(SELECT max("publishedAt") FROM snapshots WHERE status='published')`).Scan(&seen) != nil || seen != 0 {
		t.Fatalf("failed publication changed %d registry rows", seen)
	}
}

func TestLocalIdentityBackfill(t *testing.T) {
	adminURL := os.Getenv("TEST_IDENTITY_ADMIN_DATABASE_URL")
	if adminURL == "" {
		t.Skip("disposable identity database not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	admin := identityConn(t, ctx, adminURL)
	script, err := os.ReadFile("../../../ops/postgres/backfill-product-identities.sql")
	if err != nil {
		t.Fatal("backfill script unavailable")
	}
	seed := []string{
		`INSERT INTO stores(id,code,name) VALUES('identity-DINA','DINA','DINA') ON CONFLICT(code) DO NOTHING`,
		`INSERT INTO canonical_products(id,name,"categoryId") SELECT v,v,(SELECT id FROM categories ORDER BY id LIMIT 1) FROM unnest(ARRAY['bf-x-old','bf-x-new','bf-y-old','bf-y-new']) v`,
		`INSERT INTO price_history(month,"storeId","canonicalProductId","sourceProductId","rawName",price,"reviewStatus","capturedAt","snapshotId")
		 SELECT m::date,(SELECT id FROM stores WHERE code='DINA'),c,s,s,100,'approved',m::timestamp,'bf-history'
		 FROM (VALUES('2026-09-01','bf-x-old','bf-x'),('2026-10-01','bf-x-new','bf-x'),('2026-09-01','bf-y-old','bf-y')) v(m,c,s)`,
		`INSERT INTO snapshots(id,status,"publishedAt") VALUES('bf-snapshot','published','2026-11-01')`,
		`INSERT INTO raw_products(id,"storeId","sourceProductId","rawName","rawPrice","snapshotId") SELECT 'bf-raw',id,'bf-y','bf-y',100,'bf-snapshot' FROM stores WHERE code='DINA'`,
		`INSERT INTO product_mappings(id,"rawProductId","canonicalProductId","matchMethod") VALUES('bf-map','bf-raw','bf-y-new','deterministic')`,
	}
	for _, q := range seed {
		if _, err := admin.Exec(ctx, q); err != nil {
			t.Fatalf("seed failed: %v", err)
		}
	}
	card := func(source string) string {
		t.Helper()
		var id string
		if admin.QueryRow(ctx, `SELECT "canonicalProductId" FROM product_identities WHERE "sourceProductId"=$1`, source).Scan(&id) != nil {
			t.Fatalf("no registry row for %s", source)
		}
		return id
	}
	state := func() string {
		t.Helper()
		var v string
		if admin.QueryRow(ctx, `SELECT md5(json_agg(r ORDER BY "storeId","sourceProductId")::text) FROM product_identities r`).Scan(&v) != nil {
			t.Fatal("registry state unavailable")
		}
		return v
	}
	if _, err = admin.Exec(ctx, string(script)); err != nil {
		t.Fatalf("backfill failed: %v", err)
	}
	if card("bf-x") != "bf-x-new" || card("bf-y") != "bf-y-new" {
		t.Fatalf("got %s and %s", card("bf-x"), card("bf-y"))
	}
	before := state()
	if _, err = admin.Exec(ctx, string(script)); err != nil {
		t.Fatalf("second backfill failed: %v", err)
	}
	if state() != before {
		t.Fatal("second backfill changed the registry")
	}
}
