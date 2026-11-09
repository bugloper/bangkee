package domain

import (
	"context"
	"time"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
)

// Thimphu is Bhutan's clock: UTC+6 all year, no daylight saving. A day on a
// statement, a receipt or a chart is a day as the shop lived it.
var Thimphu = time.FixedZone("BTT", 6*60*60)

// Statement is one account's book over a stretch of days: what was owed
// going in, every entry in between with the balance after it, and what was
// owed coming out. It is cut from Ledger — the same entries, the same running
// balance the account screen shows — so a statement can never disagree with
// the book. Crossed-out entries are left out, as they are from the balance.
type Statement struct {
	From           *time.Time    `json:"from"` // nil: from the first entry
	To             *time.Time    `json:"to"`   // nil: up to now
	OpeningCents   int64         `json:"opening_cents"`
	Rows           []LedgerEntry `json:"rows"`
	CreditCents    int64         `json:"credit_cents"`  // taken on credit in the range
	PaymentCents   int64         `json:"payment_cents"` // paid in the range
	ClosingCents   int64         `json:"closing_cents"`
	GeneratedAt    time.Time     `json:"generated_at"`
	ThroughToToday bool          `json:"through_to_today"` // closing is today's balance
}

// ParseStatementRange reads from/to as YYYY-MM-DD days in Thimphu. Either may
// be blank. `to` is inclusive: the whole of that day is in.
func ParseStatementRange(from, to string) (*time.Time, *time.Time, error) {
	var start, end *time.Time
	if from != "" {
		day, err := time.ParseInLocation("2006-01-02", from, Thimphu)
		if err != nil {
			return nil, nil, apperr.NewRule("The start date is not a date.")
		}
		start = &day
	}
	if to != "" {
		day, err := time.ParseInLocation("2006-01-02", to, Thimphu)
		if err != nil {
			return nil, nil, apperr.NewRule("The end date is not a date.")
		}
		end = &day
	}
	if start != nil && end != nil && end.Before(*start) {
		return nil, nil, apperr.NewRule("The end date is before the start date.")
	}
	return start, end, nil
}

// AccountStatement builds the statement for [from, to].
func AccountStatement(ctx context.Context, q *store.Queries, accountID int64, from, to *time.Time) (Statement, error) {
	ledger, err := Ledger(ctx, q, accountID, false)
	if err != nil {
		return Statement{}, err
	}
	return cutStatement(ledger, from, to, time.Now()), nil
}

func cutStatement(ledger []LedgerEntry, from, to *time.Time, now time.Time) Statement {
	s := Statement{From: from, To: to, Rows: []LedgerEntry{}, GeneratedAt: now.UTC()}
	var endExclusive *time.Time
	if to != nil {
		end := to.AddDate(0, 0, 1)
		endExclusive = &end
	}
	var running int64
	for _, entry := range ledger {
		if endExclusive != nil && !entry.OccurredAt.Before(*endExclusive) {
			break // chronological: nothing later is in
		}
		running += entry.SignedAmountCents
		if from != nil && entry.OccurredAt.Before(*from) {
			s.OpeningCents = running
			continue
		}
		s.Rows = append(s.Rows, entry)
		if entry.Kind == "credit" {
			s.CreditCents += entry.AmountCents
		} else {
			s.PaymentCents += entry.AmountCents
		}
	}
	s.ClosingCents = running
	s.ThroughToToday = endExclusive == nil || endExclusive.After(now)
	return s
}
