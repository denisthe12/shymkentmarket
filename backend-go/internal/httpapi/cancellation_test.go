package httpapi

import (
	"adilbaga/backend-go/internal/middleware"
	"adilbaga/backend-go/internal/observability"
	"bytes"
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgconn"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRequestErrorClassification(t *testing.T) {
	for _, tt := range []struct {
		name   string
		err    error
		cancel bool
		want   int
		code   string
	}{
		{"success", nil, false, 200, ""},
		{"canceled", context.Canceled, true, 0, "request_canceled"},
		{"wrapped", fmt.Errorf("wrapped: %w", context.Canceled), true, 0, "request_canceled"},
		{"deadline_live_client", context.DeadlineExceeded, false, 503, "request_deadline"},
		{"db_error", errors.New("private SQL credential"), false, 500, "internal_error"},
		{"db_error_after_cancel", errors.New("private SQL credential"), true, 500, "internal_error"},
		{"joined_db_cancel", errors.Join(context.Canceled, errors.New("private SQL credential")), true, 500, "internal_error"},
		{"unconfirmed_cancel", context.Canceled, false, 500, "internal_error"},
		{"postgres_live", &pgconn.PgError{Code: "22012", Message: "private SQL credential"}, false, 500, "internal_error"},
		{"postgres_after_cancel", &pgconn.PgError{Code: "22012", Message: "private SQL credential"}, true, 500, "internal_error"},
		{"wrapped_join", fmt.Errorf("wrap: %w", errors.Join(context.Canceled, errors.New("private SQL"))), true, 500, "internal_error"},
		{"joined_cancels", errors.Join(context.Canceled, fmt.Errorf("wrap: %w", context.Canceled)), true, 0, "request_canceled"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			reg := observability.NewRegistry()
			h := middleware.RequestID(middleware.AccessLog(observability.New(&logs, "info"), reg)(middleware.Timeout(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { respondRequest(w, r, []string{}, tt.err) }))))
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if tt.cancel {
				cancel()
			}
			r := httptest.NewRequest("GET", "/api/products?secret=private", nil).WithContext(ctx)
			w := &auditWriter{header: make(http.Header)}
			h.ServeHTTP(w, r)
			if w.status != tt.want {
				t.Fatalf("status=%d want=%d logs=%s", w.status, tt.want, logs.String())
			}
			if tt.code != "" && !bytes.Contains(logs.Bytes(), []byte(`"error_code":"`+tt.code+`"`)) {
				t.Fatalf("missing code: %s", logs.String())
			}
			if tt.code != "" && reg.Snapshot().Series["http_outcome|"+tt.code].Count != 1 {
				t.Fatal("missing outcome metric")
			}
			if tt.want == 0 && reg.Snapshot().Series["http|unmatched|GET|2xx"].Count != 0 {
				t.Fatal("cancellation became success metric")
			}
			if bytes.Contains(logs.Bytes(), []byte("private")) || bytes.Contains(w.body.Bytes(), []byte("private")) {
				t.Fatal("private error leaked")
			}
		})
	}
}

type auditWriter struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (w *auditWriter) Header() http.Header { return w.header }
func (w *auditWriter) WriteHeader(s int) {
	if w.status == 0 {
		w.status = s
	}
}
func (w *auditWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = 200
	}
	return w.body.Write(b)
}

func TestClientDisconnect(t *testing.T) {
	var logs bytes.Buffer
	reg := observability.NewRegistry()
	entered, finished := make(chan struct{}), make(chan struct{})
	h := middleware.RequestID(middleware.AccessLog(observability.New(&logs, "info"), reg)(middleware.Timeout(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-r.Context().Done()
		respondRequest(w, r, nil, fmt.Errorf("operation: %w", r.Context().Err()))
	}))))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { h.ServeHTTP(w, r); close(finished) }))
	defer server.Close()
	conn, err := net.Dial("tcp", strings.TrimPrefix(server.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err = fmt.Fprint(conn, "GET /api/products HTTP/1.1\r\nHost: localhost\r\nX-Request-ID: disconnect-fixture\r\n\r\n"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("handler did not start")
	}
	conn.Close()
	select {
	case <-finished:
	case <-time.After(3 * time.Second):
		t.Fatal("request context not canceled")
	}
	if !bytes.Contains(logs.Bytes(), []byte(`"status":0`)) || !bytes.Contains(logs.Bytes(), []byte(`"error_code":"request_canceled"`)) || !bytes.Contains(logs.Bytes(), []byte(`"request_id":"disconnect-fixture"`)) {
		t.Fatal(logs.String())
	}
	hmetric := reg.Snapshot().Series["http|unmatched|GET|canceled"]
	if hmetric.Count != 1 || hmetric.Failures != 0 {
		t.Fatalf("metrics: %+v", reg.Snapshot())
	}
	if reg.Snapshot().Series["http_outcome|request_canceled"].Count != 1 {
		t.Fatal("missing cancellation outcome")
	}
}

func TestPreserveServerFailures(t *testing.T) {
	for _, name := range []string{"panic", "marshal", "written"} {
		t.Run(name, func(t *testing.T) {
			var logs bytes.Buffer
			h := middleware.AccessLog(observability.New(&logs, "info"))(middleware.Recover(observability.New(&logs, "info"))(middleware.Timeout(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch name {
				case "panic":
					panic("private SQL")
				case "marshal":
					respondRequest(w, r, make(chan int), nil)
				case "written":
					w.WriteHeader(202)
					respondRequest(w, r, nil, context.Canceled)
				}
			}))))
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest("GET", "/api/products", nil).WithContext(ctx))
			want := 500
			if name == "written" {
				want = 202
			}
			if w.Code != want {
				t.Fatalf("%d %s", w.Code, logs.String())
			}
			if strings.Contains(logs.String(), "private SQL") {
				t.Fatal("panic detail leak")
			}
		})
	}
}

func TestDeadlineWithConnectedClient(t *testing.T) {
	var logs bytes.Buffer
	reg := observability.NewRegistry()
	h := middleware.AccessLog(observability.New(&logs, "info"), reg)(middleware.Timeout(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Millisecond)
		defer cancel()
		<-ctx.Done()
		respondRequest(w, r, nil, fmt.Errorf("dependency: %w", ctx.Err()))
	})))
	server := httptest.NewServer(h)
	defer server.Close()
	client := server.Client()
	client.Timeout = 3 * time.Second
	response, err := client.Get(server.URL + "/api/products")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	_, err = io.Copy(io.Discard, response.Body)
	if err != nil {
		t.Fatal(err)
	}
	// AccessLog can finish immediately after delivery: use a synchronized outer wrapper below in disconnect test;
	// here poll only the concurrency-safe registry, then inspect no shared buffer.
	until := time.Now().Add(time.Second)
	for reg.Snapshot().Series["http_outcome|request_deadline"].Count == 0 && time.Now().Before(until) {
		time.Sleep(time.Millisecond)
	}
	if response.StatusCode != 503 || reg.Snapshot().Series["http_outcome|request_deadline"].Count != 1 {
		t.Fatal("deadline must be 503 with a distinct metric")
	}
}
