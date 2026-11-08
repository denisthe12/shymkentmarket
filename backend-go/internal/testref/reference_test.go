package testref

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
)

type fakeReporter struct {
	mu       sync.Mutex
	errors   []string
	fatals   []string
	cleanups []func()
}

func (f *fakeReporter) Helper() {}
func (f *fakeReporter) Errorf(format string, args ...any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.errors = append(f.errors, fmt.Sprintf(format, args...))
}
func (f *fakeReporter) Fatalf(format string, args ...any) {
	f.mu.Lock()
	f.fatals = append(f.fatals, fmt.Sprintf(format, args...))
	f.mu.Unlock()
	runtime.Goexit()
}
func (f *fakeReporter) Cleanup(fn func()) { f.cleanups = append(f.cleanups, fn) }
func (f *fakeReporter) run() {
	for i := len(f.cleanups) - 1; i >= 0; i-- {
		f.cleanups[i]()
	}
	f.cleanups = nil
}

// startAsync runs Start on its own goroutine so a Fatalf (Goexit) cannot end the test goroutine.
func startAsync(r *fakeReporter, upstream string, record bool, file string) string {
	var base string
	done := make(chan struct{})
	go func() {
		defer close(done)
		base = Start(r, upstream, record, file)
	}()
	<-done
	return base
}

func echoUpstream(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(map[string]string{"echo": r.Method + " " + r.URL.RequestURI() + " " + r.Header.Get("Content-Type") + " " + string(body)})
	}))
	t.Cleanup(server.Close)
	return server
}

type result struct {
	status      int
	contentType string
	body        string
}

func call(t *testing.T, base, method, path, contentType, body string) result {
	t.Helper()
	req, err := http.NewRequest(method, base+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return result{resp.StatusCode, resp.Header.Get("Content-Type"), string(raw)}
}

func writeFile(t *testing.T, exchanges []Exchange) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "ref.json")
	raw, err := json.Marshal(exchanges)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestLiveModeReturnsUpstream(t *testing.T) {
	r := &fakeReporter{}
	file := filepath.Join(t.TempDir(), "ref.json")
	if got := Start(r, "http://127.0.0.1:1", false, file); got != "http://127.0.0.1:1" {
		t.Fatalf("live base = %q", got)
	}
	r.run()
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("live mode must not create a reference file")
	}
}

func TestRecordThenReplay(t *testing.T) {
	upstream := echoUpstream(t)
	file := filepath.Join(t.TempDir(), "nested", "ref.json")
	requests := []struct{ method, path, contentType, body string }{
		{"GET", "/api/a?x=1", "", ""},
		{"POST", "/api/v", "application/json", `{"text":"x"}`},
		{"POST", "/api/v", "application/x-www-form-urlencoded", `{"text":"x"}`},
	}
	recorder := &fakeReporter{}
	base := Start(recorder, upstream.URL, true, file)
	var recorded []result
	for _, q := range requests {
		recorded = append(recorded, call(t, base, q.method, q.path, q.contentType, q.body))
	}
	recorder.run()
	if len(recorder.errors)+len(recorder.fatals) != 0 {
		t.Fatalf("recording reported %v %v", recorder.errors, recorder.fatals)
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasSuffix(raw, []byte("\n")) {
		t.Fatal("reference file must end with a newline")
	}
	var exchanges []Exchange
	if err := json.Unmarshal(raw, &exchanges); err != nil || len(exchanges) != 3 {
		t.Fatalf("exchanges=%d err=%v", len(exchanges), err)
	}
	for i, q := range requests {
		if exchanges[i].Method != q.method || exchanges[i].Path != q.path || exchanges[i].ContentType != q.contentType || exchanges[i].Body != q.body {
			t.Fatalf("exchange %d out of order: %+v", i, exchanges[i])
		}
	}
	stable, _ := json.MarshalIndent(exchanges, "", "  ")
	if !bytes.Equal(append(stable, '\n'), raw) {
		t.Fatal("reference file is not in stable MarshalIndent form")
	}
	upstream.Close()

	player := &fakeReporter{}
	replay := Start(player, "", false, file)
	for i, q := range requests {
		if got := call(t, replay, q.method, q.path, q.contentType, q.body); got != recorded[i] {
			t.Fatalf("replay %d = %+v, recorded %+v", i, got, recorded[i])
		}
	}
	player.run()
	if len(player.errors)+len(player.fatals) != 0 {
		t.Fatalf("replay reported %v %v", player.errors, player.fatals)
	}
}

func TestReplaySequence(t *testing.T) {
	file := writeFile(t, []Exchange{
		{Method: "POST", Path: "/api/v", ContentType: "application/json", Body: "{}", Status: 201, ResponseContentType: "application/json", Response: `"1"`},
		{Method: "POST", Path: "/api/v", ContentType: "application/json", Body: "{}", Status: 201, ResponseContentType: "application/json", Response: `"2"`},
	})
	r := &fakeReporter{}
	base := Start(r, "", false, file)
	for _, want := range []string{`"1"`, `"2"`} {
		if got := call(t, base, "POST", "/api/v", "application/json", "{}"); got.status != 201 || got.body != want {
			t.Fatalf("got %+v want %s", got, want)
		}
	}
	if got := call(t, base, "POST", "/api/v", "application/json", "{}"); got.status != 599 {
		t.Fatalf("exhausted key status = %d", got.status)
	}
	r.run()
	if len(r.errors) != 1 || r.errors[0] != "reference: missing exchange POST /api/v" {
		t.Fatalf("errors = %q", r.errors)
	}
}

func TestReplayMissing(t *testing.T) {
	file := writeFile(t, []Exchange{{Method: "GET", Path: "/api/a", Status: 200, Response: "[]"}})
	r := &fakeReporter{}
	base := Start(r, "", false, file)
	call(t, base, "GET", "/api/a", "", "")
	if got := call(t, base, "GET", "/api/unknown?q=1", "", ""); got.status != 599 {
		t.Fatalf("missing status = %d", got.status)
	}
	r.run()
	if len(r.errors) != 1 || r.errors[0] != "reference: missing exchange GET /api/unknown?q=1" {
		t.Fatalf("errors = %q", r.errors)
	}
}

func TestReplayStale(t *testing.T) {
	file := writeFile(t, []Exchange{
		{Method: "GET", Path: "/api/a", Status: 200, Response: "[]"},
		{Method: "GET", Path: "/api/b", Status: 200, Response: "[]"},
	})
	r := &fakeReporter{}
	base := Start(r, "", false, file)
	call(t, base, "GET", "/api/a", "", "")
	r.run()
	if len(r.errors) != 1 || r.errors[0] != "reference: stale entry GET /api/b" {
		t.Fatalf("errors = %q", r.errors)
	}
}

func TestRecordWithoutUpstream(t *testing.T) {
	r := &fakeReporter{}
	startAsync(r, "", true, filepath.Join(t.TempDir(), "ref.json"))
	if len(r.fatals) != 1 || r.fatals[0] != "reference: record requires REFERENCE_API_BASE_URL" {
		t.Fatalf("fatals = %q", r.fatals)
	}
}

func TestReplayMissingFile(t *testing.T) {
	r := &fakeReporter{}
	startAsync(r, "", false, filepath.Join(t.TempDir(), "absent.json"))
	if len(r.fatals) != 1 || !strings.HasPrefix(r.fatals[0], "reference: read ") {
		t.Fatalf("fatals = %q", r.fatals)
	}
}

func TestMessagesOmitBody(t *testing.T) {
	file := writeFile(t, []Exchange{{Method: "GET", Path: "/api/a", Status: 200, Response: "[]"}})
	r := &fakeReporter{}
	base := Start(r, "", false, file)
	call(t, base, "POST", "/api/voice/start", "application/json", `{"text":"privacyprobeqzrvnxtkmwbdjlf"}`)
	r.run()
	if len(r.errors) == 0 {
		t.Fatal("expected missing and stale errors")
	}
	for _, message := range r.errors {
		if strings.Contains(message, "privacyprobe") {
			t.Fatalf("error leaks request body: %q", message)
		}
	}
}
