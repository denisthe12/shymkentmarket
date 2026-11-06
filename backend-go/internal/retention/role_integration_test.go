//go:build integration

package retention

import (
	"context"
	"errors"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func localTarget(value, user string) bool {
	u, err := url.Parse(value)
	if err != nil || u.Path != "/part13_retention" || u.User == nil || u.User.Username() != user {
		return false
	}
	allowed := func(h string) bool { return h == "127.0.0.1" || h == "localhost" || h == "::1" }
	if !allowed(u.Hostname()) {
		return false
	}
	c, err := pgx.ParseConfig(value)
	if err != nil || !allowed(c.Host) || c.Database != "part13_retention" {
		return false
	}
	for _, f := range c.Fallbacks {
		if !allowed(f.Host) {
			return false
		}
	}
	return true
}

func TestLocalRetentionTargetGuard(t *testing.T) {
	for _, s := range []string{"", "postgres://postgres:p@example.com/part13_retention", "postgres://postgres:p@127.0.0.1/production", "postgres://postgres:p@127.0.0.1/part13_retention?host=remote.example", "postgres://postgres:p@127.0.0.1/part13_retention?host=127.0.0.1,remote.example", "postgres://other:p@127.0.0.1/part13_retention"} {
		if localTarget(s, "postgres") {
			t.Fatal("unsafe target accepted: " + s)
		}
	}
	if !localTarget("postgres://postgres:p@127.0.0.1:5432/part13_retention", "postgres") {
		t.Fatal("valid local target rejected")
	}
}

// Independent explicit LOCAL profile: no runtime/production URL fallback.
func TestLocalRetentionRoleBoundary(t *testing.T) {
	adminURL := os.Getenv("TEST_RETENTION_ADMIN_DATABASE_URL")
	writerURL := os.Getenv("TEST_RETENTION_WRITER_DATABASE_URL")
	if adminURL == "" && writerURL == "" {
		t.Skip("explicit disposable part13_retention profile required")
	}
	if !localTarget(adminURL, "postgres") || !localTarget(writerURL, "part13_retention_login") {
		t.Fatal("dedicated loopback part13_retention owner and restricted login required")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 45*time.Second)
	defer cancel()
	connect := func(value string) *pgx.Conn {
		t.Helper()
		c, err := pgx.Connect(ctx, value)
		if err != nil {
			t.Fatal("local connection unavailable")
		}
		t.Cleanup(func() { _ = c.Close(context.Background()) })
		return c
	}
	admin := connect(adminURL)
	writer := connect(writerURL)

	denied := func(q string) {
		t.Helper()
		tx, err := writer.Begin(ctx)
		if err != nil {
			t.Fatal("local proof transaction")
		}
		defer tx.Rollback(context.Background())
		_, err = tx.Exec(ctx, q)
		var pe *pgconn.PgError
		if !errors.As(err, &pe) || pe.Code != "42501" {
			t.Fatalf("expected 42501 for %q, got %v", q, err)
		}
	}
	allowed := func(q string) {
		t.Helper()
		tx, err := writer.Begin(ctx)
		if err != nil {
			t.Fatal("local proof transaction")
		}
		defer tx.Rollback(context.Background())
		if _, err = tx.Exec(ctx, q); err != nil {
			t.Fatalf("allowed statement failed %q: %v", q, err)
		}
	}

	t.Run("role attributes and policies", func(t *testing.T) {
		var safe bool
		err := admin.QueryRow(ctx, `SELECT NOT (rolcanlogin OR rolsuper OR rolcreaterole OR rolbypassrls) AND NOT rolcreatedb AND NOT rolreplication
   AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid)
   FROM pg_roles r WHERE rolname='aktau_retention_writer'`).Scan(&safe)
		if err != nil || !safe {
			t.Fatal("retention role must be NOLOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS")
		}
		var n int
		if admin.QueryRow(ctx, `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles=ARRAY['aktau_retention_writer']::name[]`).Scan(&n) != nil || n != 10 {
			t.Fatalf("expected 10 retention policies, got %d", n)
		}
	})
	t.Run("delete allowed on retention tables", func(t *testing.T) {
		for _, table := range []string{"snapshots", "source_runs", "raw_products", "product_mappings", "offers"} {
			allowed("DELETE FROM public." + table + " WHERE false")
			allowed("SELECT * FROM public." + table + " LIMIT 1")
		}
	})
	t.Run("insert and update denied", func(t *testing.T) {
		denied("INSERT INTO public.offers(id) VALUES('retention-negative')")
		denied("UPDATE public.snapshots SET id=id WHERE false")
	})
	t.Run("catalog tables fully denied", func(t *testing.T) {
		for _, table := range []string{"stores", "categories", "canonical_products"} {
			denied("SELECT * FROM public." + table + " LIMIT 1")
			denied("DELETE FROM public." + table + " WHERE false")
		}
	})
}
