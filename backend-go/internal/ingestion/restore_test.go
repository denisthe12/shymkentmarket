package ingestion

import (
	"reflect"
	"testing"
)

func fourStores() (a, f, d, n RawProduct) {
	return raw("STORE_A", "1"), raw("STORE_C", "3"), raw("STORE_B", "2"), raw("MAGNUM", "5")
}

func TestRestoreGivesReturnedProductItsID(t *testing.T) {
	a, f, d, n := fourStores()
	b := bundleOf(group(a), group(f), group(d), group(n))
	prev, restored := restoreIdentities(b, nil, map[Identity]string{a.Identity(): "OLD"})
	out, rep, err := resolve(b, prev, nil, cats, testStores, 100, false)
	if err != nil || restored != 1 || out[0].ID != "OLD" || !out[0].Reused || rep.NewCanonical != 3 {
		t.Fatalf("got %v %d %+v %+v", err, restored, out[0], rep)
	}
}

func TestRestoreSkipsIDHeldByCurrentVote(t *testing.T) {
	a, f, d, n := fourStores()
	b := bundleOf(group(a), group(f), group(d), group(n))
	held := map[Identity][]string{a.Identity(): {"X"}}
	prev, restored := restoreIdentities(b, held, map[Identity]string{d.Identity(): "X"})
	out, _, err := resolve(b, prev, nil, cats, testStores, 100, false)
	if err != nil || restored != 0 || out[0].ID != "X" || out[2].ID == "X" || out[2].Reused {
		t.Fatalf("got %v %d %+v %+v", err, restored, out[0], out[2])
	}
}

func TestRestoreSkipsGroupWithVotes(t *testing.T) {
	a, f, d, n := fourStores()
	b := bundleOf(group(a, d), group(f), group(n))
	held := map[Identity][]string{a.Identity(): {"X"}}
	prev, restored := restoreIdentities(b, held, map[Identity]string{d.Identity(): "Y"})
	out, _, err := resolve(b, prev, nil, cats, testStores, 100, false)
	if err != nil || restored != 0 || out[0].ID != "X" {
		t.Fatalf("got %v %d %+v", err, restored, out[0])
	}
}

func TestRestoreFirstGroupWinsSharedID(t *testing.T) {
	a, f, d, n := fourStores()
	b := bundleOf(group(a), group(d), group(f), group(n))
	prev, restored := restoreIdentities(b, nil, map[Identity]string{a.Identity(): "X", d.Identity(): "X"})
	out, _, err := resolve(b, prev, nil, cats, testStores, 100, false)
	if err != nil || restored != 1 || out[0].ID != "X" || out[1].ID == "X" || out[1].Reused {
		t.Fatalf("got %v %d %+v %+v", err, restored, out[0], out[1])
	}
}

func TestRestoreMajorityWins(t *testing.T) {
	a, f, d, n := fourStores()
	a2 := raw("STORE_A", "9")
	b := bundleOf(group(a, a2, d), group(f), group(n))
	remembered := map[Identity]string{a.Identity(): "B", a2.Identity(): "B", d.Identity(): "A"}
	prev, _ := restoreIdentities(b, nil, remembered)
	out, _, err := resolve(b, prev, nil, cats, testStores, 100, false)
	if err != nil || out[0].ID != "B" {
		t.Fatalf("got %v %+v", err, out[0])
	}
}

func TestRestoreTieTakesSmallestID(t *testing.T) {
	a, f, d, n := fourStores()
	b := bundleOf(group(a, d), group(f), group(n))
	prev, _ := restoreIdentities(b, nil, map[Identity]string{a.Identity(): "B", d.Identity(): "A"})
	out, _, err := resolve(b, prev, nil, cats, testStores, 100, false)
	if err != nil || out[0].ID != "A" {
		t.Fatalf("got %v %+v", err, out[0])
	}
}

func TestRestoreUnderRecluster(t *testing.T) {
	a, f, d, n := fourStores()
	b := bundleOf(group(a), group(f), group(d), group(n))
	prev, restored := restoreIdentities(b, nil, map[Identity]string{a.Identity(): "OLD"})
	out, rep, err := resolve(b, prev, nil, cats, testStores, 100, true)
	if err != nil || restored != 1 || out[0].ID != "OLD" || rep.MergedCanonical != 0 || rep.SplitCanonical != 0 {
		t.Fatalf("got %v %d %+v %+v", err, restored, out[0], rep)
	}
}

func TestRestoreDoesNotMutatePrevious(t *testing.T) {
	a, f, d, n := fourStores()
	b := bundleOf(group(a), group(f), group(d), group(n))
	held := map[Identity][]string{a.Identity(): {"X"}}
	want := map[Identity][]string{a.Identity(): {"X"}}
	restoreIdentities(b, held, map[Identity]string{d.Identity(): "Y"})
	if !reflect.DeepEqual(held, want) {
		t.Fatalf("previous changed: %+v", held)
	}
}
