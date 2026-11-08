//go:build integration

package integration

import (
	"os"
	"path/filepath"
	"testing"

	"adilbaga/backend-go/internal/testref"
)

// referenceBase is the reference origin for a parity test: the live
// REFERENCE_API_BASE_URL when set (recorded when REFERENCE_RECORD=1), otherwise
// a replay of testdata/reference/<TestName>.json. Call it after the test's own
// skip checks so skipped tests never report stale recorded entries.
func referenceBase(t *testing.T) string {
	t.Helper()
	return testref.Start(t, os.Getenv("REFERENCE_API_BASE_URL"), os.Getenv("REFERENCE_RECORD") == "1",
		filepath.Join("testdata", "reference", t.Name()+".json"))
}
