//go:build integration

package postgres

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"testing"
	"time"
)

func TestLocalCanceledQuery(t *testing.T) {
	raw := policyTestURL(t) // existing fail-closed disposable loopback target guard
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		t.Fatal("pool setup")
	}
	defer pool.Close()
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal("acquire")
	}
	defer conn.Release()
	pid := conn.Conn().PgConn().PID()
	queryCtx, stop := context.WithCancel(ctx)
	defer stop()
	result := make(chan error, 1)
	go func() { _, err := conn.Exec(queryCtx, "SELECT pg_sleep(10)"); result <- err }()
	active := false
	until := time.Now().Add(3 * time.Second)
	for time.Now().Before(until) {
		err = pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event='PgSleep')", pid).Scan(&active)
		if err != nil {
			t.Fatal("query observation")
		}
		if active {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !active {
		stop()
		<-result
		t.Fatal("real running query was not observed")
	}
	stop()
	select {
	case err = <-result:
	case <-time.After(3 * time.Second):
		t.Fatal("query not interrupted")
	}
	if !errors.Is(err, context.Canceled) || !errors.Is(databaseError(err), context.Canceled) {
		t.Fatalf("cancellation class %T", err)
	}
	_, err = pool.Exec(ctx, "SELECT 1/0")
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "22012" {
		t.Fatal("real PostgreSQL failure not observed")
	}
	canceledCtx, cancelDB := context.WithCancel(ctx)
	cancelDB()
	if canceledCtx.Err() == nil || errors.Is(databaseError(err), context.Canceled) || databaseError(err) == nil {
		t.Fatal("independent DB failure suppressed")
	}
}
