package main

import (
	"flag"
	"io"
	"os"
	"strings"
	"testing"
)

// unreachable is a well-formed URL to a closed loopback port: any attempt to
// connect would produce a connection error instead of the expected early one.
const unreachable = "postgres://u:p@127.0.0.1:1/db?sslmode=disable"

func runWith(t *testing.T, args ...string) (error, string) {
	t.Helper()
	oldArgs, oldFlags, oldStderr := os.Args, flag.CommandLine, os.Stderr
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		os.Args, flag.CommandLine, os.Stderr = oldArgs, oldFlags, oldStderr
		_ = r.Close()
		_ = w.Close()
	}()
	os.Args = append([]string{"prune"}, args...)
	flag.CommandLine = flag.NewFlagSet("prune", flag.ContinueOnError)
	os.Stderr = w
	runErr := run()
	_ = w.Close()
	raw, _ := io.ReadAll(r)
	return runErr, string(raw)
}

func TestConfigurationFailureStructuredPrivacy(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	const secret = "invalid-private-credential-c7aed213571b7af3"
	t.Setenv("RETENTION_DATABASE_URL", secret)
	err, logs := runWith(t, "-keep", "14")
	if err == nil {
		t.Fatal("missing invalid config failure")
	}
	if strings.Contains(logs, secret) || !strings.Contains(logs, `"error_code":"retention_configuration_failed"`) || !strings.Contains(logs, `"mode":"dry_run"`) {
		t.Fatal("unsafe or missing structured retention failure")
	}
}

func TestKeepBelowMinimumRejected(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("RETENTION_DATABASE_URL", unreachable)
	err, _ := runWith(t, "-keep", "3")
	if err == nil || err.Error() != "keep below minimum" {
		t.Fatal("keep below minimum must fail before connecting")
	}
}

func TestProductionApplyRequiresConfirm(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("RETENTION_PRODUCTION_APPLY_CONFIRM", "")
	t.Setenv("RETENTION_DATABASE_URL", unreachable)
	err, _ := runWith(t, "-keep", "14", "-apply")
	if err == nil || err.Error() != "production retention apply not confirmed" {
		t.Fatal("production apply must require confirmation before connecting")
	}
}
