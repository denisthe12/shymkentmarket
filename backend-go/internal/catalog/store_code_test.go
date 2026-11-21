package catalog

import (
	"strings"
	"testing"
)

func TestValidStoreCode(t *testing.T) {
	for _, code := range []string{"MAGNUM", "STORE_A", "A1", strings.Repeat("A", 32)} {
		if !ValidStoreCode(code) {
			t.Errorf("%q rejected", code)
		}
	}
	for _, code := range []string{"", "magnum", "M", "MAGNUM-1", "1STORE", "_STORE", "STORE A", "MAGNUM\n", strings.Repeat("A", 33)} {
		if ValidStoreCode(code) {
			t.Errorf("%q accepted", code)
		}
	}
}
