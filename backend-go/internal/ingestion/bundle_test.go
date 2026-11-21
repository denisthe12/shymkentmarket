package ingestion

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func sample() Bundle {
	confidence := 1.0
	b := Bundle{Version: "1.0", GeneratedAt: "2026-10-05T12:00:00Z"}
	for _, store := range testStores {
		p := RawProduct{StoreCode: store, SourceProductID: "source", Name: "Milk", Price: 100, RawPayload: map[string]any{}}
		b.RawProducts = append(b.RawProducts, p)
		b.Groups = append(b.Groups, Group{Name: "Milk", Category: "milk", Attributes: map[string]any{"volumeMl": json.Number("1000"), "lactoseFree": false}, Members: []Member{{Raw: p, Method: "deterministic", Confidence: &confidence, Review: "approved"}}})
	}
	return b
}

// preparedStores are the two synthetic stores of testdata/prepared_bundle.json.
var preparedStores = []string{"STORE_A", "STORE_B"}

func preparedBundle(t *testing.T) Bundle {
	t.Helper()
	f, err := os.Open("testdata/prepared_bundle.json")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	b, err := Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestPreparedDataset(t *testing.T) {
	b := preparedBundle(t)
	if len(b.RawProducts) != 7 || len(b.Groups) != 5 || len(b.Sources) != 0 {
		t.Fatal("prepared dataset counts")
	}
	_, report, err := resolve(b, nil, nil, map[string]string{"milk": "milk", "sugar": "sugar", "eggs": "eggs", "bread": "bread"}, preparedStores, 0, false)
	if err != nil {
		t.Fatal(err)
	}
	if report.MatchedAcrossStores != 2 || report.NewCanonical != 5 || report.PerStore["STORE_A"] != 4 || report.PerStore["STORE_B"] != 3 {
		t.Fatalf("prepared dataset identity metrics: %+v", report)
	}
}

func TestBundleValidation(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Bundle)
	}{
		{"version", func(b *Bundle) { b.Version = "2" }},
		{"capture", func(b *Bundle) { b.GeneratedAt = "invalid" }},
		{"duplicate", func(b *Bundle) { b.RawProducts = append(b.RawProducts, b.RawProducts[0]) }},
		{"price", func(b *Bundle) { b.RawProducts[0].Price = 0 }},
		{"member mismatch", func(b *Bundle) { b.Groups[0].Members[0].Raw.Price++ }},
		{"coverage", func(b *Bundle) { b.Groups = b.Groups[1:] }},
		{"nested attribute", func(b *Bundle) { b.Groups[0].Attributes["x"] = map[string]any{"x": true} }},
		{"confidence", func(b *Bundle) { v := 2.0; b.Groups[0].Members[0].Confidence = &v }},
		{"lowercase store", func(b *Bundle) { setStore(b, "magnum") }},
		{"short store", func(b *Bundle) { setStore(b, "M") }},
		{"dashed store", func(b *Bundle) { setStore(b, "MAGNUM-1") }},
		{"long store", func(b *Bundle) { setStore(b, strings.Repeat("A", 33)) }},
		{"source store", func(b *Bundle) { b.Sources = []SourceInput{{StoreCode: "magnum", CapturedAt: "2026-10-05T11:00:00Z"}} }},
		{"duplicate source", func(b *Bundle) {
			b.Sources = []SourceInput{{StoreCode: "STORE_A", CapturedAt: "2026-10-05T11:00:00Z"}, {StoreCode: "STORE_A", CapturedAt: "2026-10-05T11:00:00Z"}}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := sample()
			tc.mutate(&b)
			if b.Validate() == nil {
				t.Fatal("invalid bundle accepted")
			}
		})
	}
	if sample().Validate() != nil {
		t.Fatal("valid typed bundle rejected")
	}
	for _, code := range []string{"STORE_A", "MAGNUM", "A1", strings.Repeat("A", 32)} {
		b := sample()
		setStore(&b, code)
		if err := b.Validate(); err != nil {
			t.Fatalf("valid store code %q rejected: %v", code, err)
		}
	}
	if _, err := Decode(strings.NewReader(`{} {}`)); err == nil {
		t.Fatal("trailing JSON accepted")
	}
}

func TestCanonicalIdentityAndQuality(t *testing.T) {
	cats := map[string]string{"milk": "category"}
	b := sample()
	old := map[Identity][]string{b.RawProducts[0].Identity(): {"stable-1"}, b.RawProducts[1].Identity(): {"stable-2"}}
	result, report, err := resolve(b, old, nil, cats, testStores, 0, false)
	if err != nil || result[0].ID != "stable-1" || result[1].ID != "stable-2" || report.ReusedCanonical != 2 || report.NewCanonical != 2 {
		t.Fatal("stable identity")
	}
	cases := []struct {
		name     string
		bundle   Bundle
		previous map[Identity][]string
		counts   map[string]int
		code     string
	}{
		{"drop", b, nil, map[string]int{"STORE_A": 2}, "store_count_drop"},
		{"merge", b, map[Identity][]string{b.RawProducts[0].Identity(): {"one", "two"}}, nil, "canonical_merge_conflict"},
		{"split", b, map[Identity][]string{b.RawProducts[0].Identity(): {"one"}, b.RawProducts[1].Identity(): {"one"}}, nil, "canonical_split_conflict"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, r, e := resolve(tc.bundle, tc.previous, tc.counts, cats, testStores, 0, false)
			if e == nil || r.FailureCode != tc.code {
				t.Fatal("quality gate")
			}
		})
	}
	b.RawProducts = b.RawProducts[1:]
	b.Groups = b.Groups[1:]
	if _, r, e := resolve(b, nil, nil, cats, testStores, 0, false); e == nil || r.FailureCode != "required_source_missing" {
		t.Fatal("required store")
	}
	b = sample()
	b.Groups[0].Category = "unknown"
	if _, r, e := resolve(b, nil, nil, cats, testStores, 0, false); e == nil || r.FailureCode != "unknown_canonical_category" {
		t.Fatal("unknown category")
	}
}

func TestDecodeAcceptsPipelineBundle(t *testing.T) {
	f, err := os.Open("testdata/pipeline_bundle.json")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	b, err := Decode(f)
	if err != nil {
		t.Fatalf("pipeline bundle rejected: %v", err)
	}
	if len(b.RawProducts) != 4 || len(b.Groups) != 3 || len(b.Sources) != 4 {
		t.Fatalf("unexpected shape: %d raw, %d groups, %d sources", len(b.RawProducts), len(b.Groups), len(b.Sources))
	}
	registered := map[string]string{}
	for _, code := range testStores {
		registered[code] = "id-" + code
	}
	if err := checkStores(b, registered); err != nil {
		t.Fatalf("pipeline bundle does not match its stores: %v", err)
	}
}

// setStore moves the first product (and its group member) to another store code under a fresh source id.
func setStore(b *Bundle, code string) {
	for _, p := range []*RawProduct{&b.RawProducts[0], &b.Groups[0].Members[0].Raw} {
		p.StoreCode, p.SourceProductID = code, "moved"
	}
}

// Decode checks only the format of codes; which stores exist is checked by the ingestor against public.stores.
func TestValidateAcceptsAnySourceRunSet(t *testing.T) {
	count := 1
	b := sample()
	b.Sources = []SourceInput{{StoreCode: "STORE_A", CapturedAt: "2026-10-05T11:00:00Z", ProductCount: &count}}
	if err := b.Validate(); err != nil {
		t.Fatalf("partial source runs rejected by Decode: %v", err)
	}
}

func TestCheckStores(t *testing.T) {
	registered := map[string]string{"STORE_A": "id-a", "STORE_B": "id-b"}
	runs := func(codes ...string) []SourceInput {
		out := []SourceInput{}
		for _, c := range codes {
			out = append(out, SourceInput{StoreCode: c, CapturedAt: "2026-10-05T11:00:00Z"})
		}
		return out
	}
	b := preparedBundle(t)
	if err := checkStores(b, registered); err != nil {
		t.Fatalf("bundle without source runs: %v", err)
	}
	b.Sources = runs("STORE_B", "STORE_A")
	if err := checkStores(b, registered); err != nil {
		t.Fatalf("matching source runs: %v", err)
	}
	for name, sources := range map[string][]SourceInput{"subset": runs("STORE_A"), "superset": runs("STORE_A", "STORE_B", "STORE_C")} {
		b.Sources = sources
		if err := checkStores(b, registered); err == nil || err.Error() != "ingestion stores mismatch" {
			t.Fatalf("%s: got %v", name, err)
		}
	}
	b = preparedBundle(t)
	b.RawProducts[0].StoreCode = "STORE_C"
	if err := checkStores(b, registered); err == nil || err.Error() != "ingestion store unregistered" {
		t.Fatalf("unregistered product store: got %v", err)
	}
	if err := checkStores(preparedBundle(t), map[string]string{}); err == nil {
		t.Fatal("empty store registry accepted")
	}
}
