package domain

import (
	"testing"
	"time"
)

func entryAt(day string, kind string, cents int64) LedgerEntry {
	at, _ := time.ParseInLocation("2006-01-02 15:04", day, Thimphu)
	signed := cents
	if kind == "payment" {
		signed = -cents
	}
	return LedgerEntry{Kind: kind, AmountCents: cents, SignedAmountCents: signed, OccurredAt: at}
}

func TestAStatementCutsTheLedgerWithoutChangingIt(t *testing.T) {
	ledger := []LedgerEntry{
		entryAt("2026-09-01 10:00", "credit", 100_00),
		entryAt("2026-09-10 09:00", "payment", 30_00),
		entryAt("2026-10-01 00:00", "credit", 50_50),  // first minute of the 1st: inside October
		entryAt("2026-10-31 23:59", "payment", 20_00), // last minute of the 31st: inside October
		entryAt("2026-11-01 00:00", "credit", 10_00),
	}
	now := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	from, to, err := ParseStatementRange("2026-10-01", "2026-10-31")
	if err != nil {
		t.Fatal(err)
	}
	s := cutStatement(ledger, from, to, now)
	check := func(got, want int64, what string) {
		t.Helper()
		if got != want {
			t.Errorf("%s: got %d, want %d", what, got, want)
		}
	}
	check(s.OpeningCents, 70_00, "opening: Nu 100 − Nu 30")
	check(int64(len(s.Rows)), 2, "two entries in October")
	check(s.CreditCents, 50_50, "credit in range")
	check(s.PaymentCents, 20_00, "paid in range")
	check(s.ClosingCents, 100_50, "closing = opening + credit − paid")
	check(s.OpeningCents+s.CreditCents-s.PaymentCents, s.ClosingCents, "it adds up")
	if s.ThroughToToday {
		t.Error("October is over: the closing is not today's balance")
	}

	all := cutStatement(ledger, nil, nil, now)
	check(all.OpeningCents, 0, "from the start: nothing before")
	check(all.ClosingCents, 110_50, "the whole book")
	if !all.ThroughToToday {
		t.Error("no end date: through to today")
	}

	empty := cutStatement(nil, from, to, now)
	check(empty.ClosingCents, 0, "no entries, nothing owed")

	if _, _, err := ParseStatementRange("2026-10-31", "2026-10-01"); err == nil {
		t.Error("an end before the start is refused")
	}
	if _, _, err := ParseStatementRange("31/10/2026", ""); err == nil {
		t.Error("a date that is not a date is refused")
	}
}
