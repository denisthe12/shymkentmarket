package location

import (
	"math"
	"testing"
)

func TestLocation(t *testing.T) {
	if Haversine(0, 0, 0, 0) != 0 {
		t.Fatal("same point")
	}
	if math.Abs(Haversine(0, 0, 1, 0)-111194.9266) > 0.1 {
		t.Fatal("known distance")
	}
	points := []Location{{StoreCode: "STORE_A", Address: "far", Latitude: 1}, {StoreCode: "STORE_A", Address: "first"}, {StoreCode: "STORE_A", Address: "tie"}, {StoreCode: "STORE_B", Address: "other"}}
	l, d := Nearest(0, 0, "STORE_A", points)
	if l == nil || l.Address != "first" || d != 0 {
		t.Fatal("nearest tie")
	}
	if l, _ := Nearest(0, 0, "STORE_A", nil); l != nil {
		t.Fatal("empty")
	}
}
