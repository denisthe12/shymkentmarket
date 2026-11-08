// Package testref gives HTTP parity tests a reference API: a live origin, a
// recording proxy in front of one, or a replay of a recorded file. The
// recording is the frozen v1 wire contract once the legacy reference is gone.
package testref

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Reporter is the subset of *testing.T the helper needs.
type Reporter interface {
	Helper()
	Errorf(format string, args ...any)
	Fatalf(format string, args ...any)
	Cleanup(func())
}

// Exchange is one recorded request and its reference response.
type Exchange struct {
	Method              string `json:"method"`
	Path                string `json:"path"`
	ContentType         string `json:"contentType"`
	Body                string `json:"body"`
	Status              int    `json:"status"`
	ResponseContentType string `json:"responseContentType"`
	Response            string `json:"response"`
}

const bodyLimit = 1 << 20

// Start returns the reference base URL.
// upstream!="" && !record -> upstream as is (live).
// upstream!="" && record  -> recording proxy; file rewritten at Cleanup.
// upstream=="" && !record -> replay server from file.
// upstream=="" && record  -> Fatalf.
func Start(r Reporter, upstream string, record bool, file string) string {
	r.Helper()
	switch {
	case upstream != "" && !record:
		return upstream
	case upstream != "":
		return startRecorder(r, upstream, file)
	case record:
		r.Fatalf("reference: record requires REFERENCE_API_BASE_URL")
		return ""
	default:
		return startReplay(r, file)
	}
}

func key(method, path, contentType, body string) string {
	return method + "\x00" + path + "\x00" + contentType + "\x00" + body
}

func startRecorder(r Reporter, upstream, file string) string {
	var mu sync.Mutex
	var exchanges []Exchange
	client := &http.Client{Timeout: 20 * time.Second}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		body, err := io.ReadAll(io.LimitReader(req.Body, bodyLimit))
		if err != nil {
			r.Errorf("reference: read request %s %s", req.Method, req.URL.RequestURI())
			w.WriteHeader(599)
			return
		}
		forward, err := http.NewRequestWithContext(req.Context(), req.Method, upstream+req.URL.RequestURI(), bytes.NewReader(body))
		if err != nil {
			r.Errorf("reference: forward %s %s", req.Method, req.URL.RequestURI())
			w.WriteHeader(599)
			return
		}
		if contentType := req.Header.Get("Content-Type"); contentType != "" {
			forward.Header.Set("Content-Type", contentType)
		}
		resp, err := client.Do(forward)
		if err != nil {
			r.Errorf("reference: upstream %s %s", req.Method, req.URL.RequestURI())
			w.WriteHeader(599)
			return
		}
		defer resp.Body.Close()
		response, err := io.ReadAll(io.LimitReader(resp.Body, bodyLimit))
		if err != nil {
			r.Errorf("reference: upstream body %s %s", req.Method, req.URL.RequestURI())
			w.WriteHeader(599)
			return
		}
		exchange := Exchange{Method: req.Method, Path: req.URL.RequestURI(), ContentType: req.Header.Get("Content-Type"),
			Body: string(body), Status: resp.StatusCode, ResponseContentType: resp.Header.Get("Content-Type"), Response: string(response)}
		mu.Lock()
		exchanges = append(exchanges, exchange)
		mu.Unlock()
		write(w, exchange)
	}))
	r.Cleanup(func() {
		server.Close()
		mu.Lock()
		defer mu.Unlock()
		raw, err := json.MarshalIndent(exchanges, "", "  ")
		if err == nil {
			err = os.MkdirAll(filepath.Dir(file), 0o755)
		}
		if err == nil {
			err = os.WriteFile(file, append(raw, '\n'), 0o644)
		}
		if err != nil {
			r.Errorf("reference: write %s: %v", file, err)
		}
	})
	return server.URL
}

func startReplay(r Reporter, file string) string {
	raw, err := os.ReadFile(file)
	var exchanges []Exchange
	if err == nil {
		err = json.Unmarshal(raw, &exchanges)
	}
	if err != nil {
		r.Fatalf("reference: read %s: %v", file, err)
		return ""
	}
	var mu sync.Mutex
	queue := map[string][]Exchange{}
	for _, e := range exchanges {
		k := key(e.Method, e.Path, e.ContentType, e.Body)
		queue[k] = append(queue[k], e)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(io.LimitReader(req.Body, bodyLimit))
		k := key(req.Method, req.URL.RequestURI(), req.Header.Get("Content-Type"), string(body))
		mu.Lock()
		pending := queue[k]
		if len(pending) == 0 {
			mu.Unlock()
			r.Errorf("reference: missing exchange %s %s", req.Method, req.URL.RequestURI())
			w.WriteHeader(599)
			return
		}
		queue[k] = pending[1:]
		mu.Unlock()
		write(w, pending[0])
	}))
	r.Cleanup(func() {
		server.Close()
		mu.Lock()
		defer mu.Unlock()
		// Report in file order so a stale-entry failure is reproducible.
		reported := map[string]int{}
		for _, e := range exchanges {
			k := key(e.Method, e.Path, e.ContentType, e.Body)
			if reported[k] < len(queue[k]) {
				reported[k]++
				r.Errorf("reference: stale entry %s %s", e.Method, e.Path)
			}
		}
	})
	return server.URL
}

func write(w http.ResponseWriter, e Exchange) {
	if e.ResponseContentType != "" {
		w.Header().Set("Content-Type", e.ResponseContentType)
	}
	w.WriteHeader(e.Status)
	_, _ = io.WriteString(w, e.Response)
}
