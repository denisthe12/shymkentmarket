package httpapi

import (
	"context"
	"sync"
	"time"
)

const (
	readyTTL    = time.Second
	notReadyTTL = 250 * time.Millisecond
)

type readinessGate struct {
	mu       sync.Mutex
	inFlight bool
	ready    bool
	until    time.Time
}

// check returns a readiness result and, for an actual failed Ping only, the
// error to classify. Contending callers never queue for a DB connection.
func (g *readinessGate) check(ctx context.Context, db Pinger) (bool, error) {
	g.mu.Lock()
	switch {
	case ctx.Err() != nil:
		g.mu.Unlock()
		return false, nil
	case time.Now().Before(g.until):
		ready := g.ready
		g.mu.Unlock()
		return ready, nil
	case g.inFlight:
		g.mu.Unlock()
		return false, nil
	}
	g.inFlight = true
	g.mu.Unlock()

	// Release admission even if the driver panics and HTTP recovery runs.
	defer func() {
		g.mu.Lock()
		g.inFlight = false
		g.mu.Unlock()
	}()
	probe, cancel := context.WithTimeout(ctx, ReadinessTimeout)
	defer cancel()
	err := db.Ping(probe)
	if probe.Err() != nil {
		err = probe.Err()
	}
	ttl := readyTTL
	if err != nil {
		ttl = notReadyTTL
	}
	g.mu.Lock()
	g.ready = err == nil
	g.until = time.Now().Add(ttl)
	g.mu.Unlock()
	return err == nil, err
}
