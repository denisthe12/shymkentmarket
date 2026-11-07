// One-shot published-snapshot retention. No scraper, scheduler, queue or API pool.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"os"
	"os/signal"
	"syscall"
	"time"

	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/retention"
	"github.com/jackc/pgx/v5"
)

func run() (resultErr error) {
	start := time.Now()
	mode, phase := "dry_run", "configuration"
	var report retention.Report
	logger := observability.New(os.Stderr, "info")
	defer func() {
		class, code := "success", ""
		if resultErr != nil {
			class = "failure"
			code = "retention_" + phase + "_failed"
		}
		args := []any{"mode", mode, "phase", phase, "outcome_class", class, "error_code", code, "duration_ms", time.Since(start).Milliseconds(), "kept_count", report.Kept, "deleted_count", report.Deleted, "offer_count", report.Offers, "mapping_count", report.Mappings, "raw_count", report.RawProducts, "source_run_count", report.SourceRuns, "history_count", report.History}
		if resultErr != nil {
			logger.Error("retention_complete", args...)
		} else {
			logger.Info("retention_complete", args...)
		}
	}()
	keep := flag.Int("keep", retention.DefaultKeep, "number of newest published snapshots to keep")
	apply := flag.Bool("apply", false, "explicitly delete; default is read-only plan")
	flag.Parse()
	if *apply {
		mode = "apply"
	}
	if flag.NArg() != 0 {
		return errors.New("unexpected arguments")
	}
	if *keep < retention.MinKeep {
		return errors.New("keep below minimum")
	}
	appEnv := os.Getenv("APP_ENV")
	if appEnv != "development" && appEnv != "test" && appEnv != "production" {
		return errors.New("APP_ENV invalid")
	}
	if *apply && appEnv == "production" && os.Getenv("RETENTION_PRODUCTION_APPLY_CONFIRM") != "1" {
		return errors.New("production retention apply not confirmed")
	}
	value := os.Getenv("RETENTION_DATABASE_URL")
	if value == "" || config.ValidateDatabaseURL(value) != nil {
		return errors.New("RETENTION_DATABASE_URL missing or invalid")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	ctx, deadline := context.WithTimeout(ctx, 5*time.Minute)
	defer deadline()
	phase = "connection"
	conn, err := pgx.Connect(ctx, value)
	if err != nil {
		return errors.New("retention connection unavailable")
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = conn.Close(c)
	}()
	// Refuse owner/migration/API credentials, including indirect role escalation.
	var safe bool
	err = conn.QueryRow(ctx, `SELECT rolcanlogin AND rolinherit AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
 AND pg_has_role(current_user,'aktau_retention_writer','USAGE') AND NOT pg_has_role(current_user,'aktau_retention_writer','SET')
 AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1
 AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner=r.oid)
 AND NOT has_schema_privilege(current_user,'public','CREATE') FROM pg_roles r WHERE rolname=current_user`).Scan(&safe)
	if err != nil || !safe {
		return errors.New("restricted retention credential required")
	}
	if _, err = conn.Exec(ctx, `SET TIME ZONE 'UTC'; SET statement_timeout='30s'; SET lock_timeout='5s'`); err != nil {
		return errors.New("retention session policy unavailable")
	}
	if !*apply {
		if _, err = conn.Exec(ctx, `SET default_transaction_read_only=on`); err != nil {
			return errors.New("dry-run read-only policy unavailable")
		}
	}
	pruner, err := retention.New(conn, *keep)
	if err != nil {
		return err
	}
	if *apply {
		phase = "deletion"
		report, err = pruner.Apply(ctx)
	} else {
		phase = "planning"
		report, err = pruner.Plan(ctx)
	}
	if err != nil {
		phase = phaseOf(phase, err)
		return err
	}
	// Counts only: no source names, URLs, product names or snapshot IDs.
	raw, err := json.Marshal(struct {
		Applied bool             `json:"applied"`
		Metrics retention.Report `json:"metrics"`
	}{*apply, report})
	if err != nil {
		return errors.New("summary unavailable")
	}
	if _, err = os.Stdout.Write(append(raw, '\n')); err != nil {
		return errors.New("summary unavailable")
	}
	return nil
}

// phaseOf reports a failed history step as "history", not as the surrounding
// deletion or planning phase, so error_code is retention_history_failed.
func phaseOf(phase string, err error) string {
	if errors.Is(err, retention.ErrHistory) {
		return "history"
	}
	return phase
}

func main() {
	if err := run(); err != nil {
		os.Exit(1)
	}
}
