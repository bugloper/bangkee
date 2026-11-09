package money

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestParseCents(t *testing.T) {
	cases := map[string]struct {
		cents int64
		ok    bool
	}{
		"1,250.50": {125_050, true},
		" 200 ":    {20_000, true},
		"0.005":    {1, true},
		"":         {0, false},
		"abc":      {0, false},
	}
	for input, want := range cases {
		cents, ok := ParseCents(input)
		if cents != want.cents || ok != want.ok {
			t.Errorf("ParseCents(%q) = %d, %v; want %d, %v", input, cents, ok, want.cents, want.ok)
		}
	}
}

func TestNgultrumMatchesTheRailsHelper(t *testing.T) {
	cases := []struct {
		cents  int64
		signed bool
		want   string
	}{
		{125_000, false, "Nu. 1,250"},
		{125_050, false, "Nu. 1,250.50"},
		{-50_000, false, "− Nu. 500"},
		{50_000, true, "+ Nu. 500"},
		{0, true, "Nu. 0"},
		{123_456_789, false, "Nu. 1,234,567.89"},
	}
	for _, c := range cases {
		if got := Ngultrum(c.cents, c.signed); got != c.want {
			t.Errorf("Ngultrum(%d, %v) = %q; want %q", c.cents, c.signed, got, c.want)
		}
	}
}

func TestLinesRoundHalfAwayFromZero(t *testing.T) {
	if got := LineTotal(decimal.RequireFromString("1.5"), 33); got != 50 { // 49.5 -> 50
		t.Errorf("LineTotal = %d; want 50", got)
	}
	if got := QuantityLabel(decimal.RequireFromString("2.00")); got != "2" {
		t.Errorf("QuantityLabel = %q", got)
	}
	if got := QuantityLabel(decimal.RequireFromString("1.50")); got != "1.5" {
		t.Errorf("QuantityLabel = %q", got)
	}
	if got := MajorUnits(12_050); got != "120.5" {
		t.Errorf("MajorUnits = %q", got)
	}
}

func TestPluralizeEntriesAndDays(t *testing.T) {
	for _, c := range []struct {
		n    int64
		word string
		want string
	}{{2, "entry", "2 entries"}, {3, "day", "3 days"}, {1, "entry", "1 entry"}, {2, "customer", "2 customers"}} {
		if got := Pluralize(c.n, c.word); got != c.want {
			t.Errorf("Pluralize(%d, %q) = %q, want %q", c.n, c.word, got, c.want)
		}
	}
}
