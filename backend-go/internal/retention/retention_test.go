package retention

import (
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestNewRejectsInvalidInput(t *testing.T) {
	if _, err := New(nil, DefaultKeep); err == nil {
		t.Fatal("nil connection must be rejected")
	}
	if _, err := New(&pgx.Conn{}, MinKeep-1); err == nil {
		t.Fatal("keep below MinKeep must be rejected")
	}
	if _, err := New(&pgx.Conn{}, MinKeep); err != nil {
		t.Fatal("keep == MinKeep must be accepted")
	}
}
