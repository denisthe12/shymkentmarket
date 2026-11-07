package postgres

import (
	"reflect"
	"testing"
)

func TestSearchPatterns(t *testing.T) {
	for _, tc := range []struct {
		input string
		want  []string
	}{
		{"", []string{}}, {" \t\u2003", []string{}},
		{" DEKMY\tтворог\u00a0", []string{"%DEKMY%", "%творог%"}},
		{`% _ \`, []string{`%\%%`, `%\_%`, `%\\%`}},
		{`' OR true --`, []string{"%'%", "%OR%", "%true%", "%--%"}},
	} {
		if got := searchPatterns(tc.input); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%q: got %q want %q", tc.input, got, tc.want)
		}
	}
}
