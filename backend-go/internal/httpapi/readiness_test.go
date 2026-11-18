package httpapi

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"adilbaga/backend-go/internal/observability"
)

func readinessRequest(h http.Handler, ctx context.Context) int {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/health/ready", nil).WithContext(ctx))
	return w.Code
}

func TestReadinessBurst(t *testing.T) {
	started := make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var calls atomic.Int32
	h := Router(testConfig(), observability.New(io.Discard, "info"), testDependencies(pingFunc(func(ctx context.Context) error {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-ctx.Done()
		return ctx.Err()
	})))
	leader := make(chan int, 1)
	go func() { leader <- readinessRequest(h, ctx) }()
	<-started
	done := make(chan struct{})
	go func() {
		var wg sync.WaitGroup
		for range 128 {
			wg.Go(func() {
				if got := readinessRequest(h, ctx); got != 503 {
					t.Errorf("busy readiness status = %d", got)
				}
			})
		}
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Error("concurrent requests queued behind Ping")
		cancel()
		<-done
	}
	if calls.Load() != 1 {
		t.Errorf("Ping calls = %d, want 1", calls.Load())
	}
	cancel()
	if got := <-leader; got != 503 {
		t.Errorf("canceled leader status = %d", got)
	}
}

func TestReadinessCacheOutageAndRecovery(t *testing.T) {
	var calls int
	fail := false
	db := pingFunc(func(context.Context) error {
		calls++
		if fail {
			return context.DeadlineExceeded
		}
		return nil
	})
	newRouter := func() http.Handler {
		return Router(testConfig(), observability.New(io.Discard, "info"), testDependencies(db))
	}
	check := func(h http.Handler, status, wantCalls int) {
		t.Helper()
		if got := readinessRequest(h, context.Background()); got != status || calls != wantCalls {
			t.Fatalf("status=%d calls=%d, want status=%d calls=%d", got, calls, status, wantCalls)
		}
	}
	h := newRouter()
	check(h, 200, 1)
	fail = true
	check(h, 200, 1)
	check(newRouter(), 503, 2)
	time.Sleep(readyTTL)
	check(h, 503, 3)
	fail = false
	check(h, 503, 3)
	time.Sleep(notReadyTTL)
	check(h, 200, 4)
}

func TestReadinessCanceledLeaderCannotCacheLateSuccess(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var gate readinessGate
	ready, err := gate.check(ctx, pingFunc(func(context.Context) error {
		cancel()
		return nil
	}))
	if ready || err != context.Canceled {
		t.Fatalf("late successful Ping was accepted: ready=%t error=%v", ready, err)
	}
	time.Sleep(notReadyTTL)
	ready, err = gate.check(context.Background(), pingFunc(func(context.Context) error { return nil }))
	if !ready || err != nil {
		t.Fatal("canceled leader prevented recovery")
	}
}
