package document

import (
	"time"

	"bangkee/internal/domain"
	"bangkee/internal/money"
)

// StatementInput is what a statement prints besides the entries.
type StatementInput struct {
	ShopName, ShopLine     string // the line under the name: where it is, its phone
	CustomerName, Customer string // Customer: their phone, or ""
	Statement              domain.Statement
	// Supplier: the shop's book with someone it buys from — the shop owes,
	// and the words say so.
	Supplier bool
}

func day(t time.Time) string { return t.In(domain.Thimphu).Format("2 Jan 2006") }

// period says which days the statement covers.
func period(s domain.Statement) string {
	switch {
	case s.From != nil && s.To != nil:
		return day(*s.From) + " to " + day(*s.To)
	case s.From != nil:
		return "From " + day(*s.From) + " to " + day(s.GeneratedAt)
	case s.To != nil:
		return "Up to " + day(*s.To)
	default:
		return "All entries to " + day(s.GeneratedAt)
	}
}

// Statement is the account statement as a PDF.
func Statement(in StatementInput) ([]byte, error) {
	s := in.Statement
	title, party, taken, takenColumn := "Account statement", "Customer", "Taken on credit", "Credit"
	if in.Supplier {
		title, party, taken, takenColumn = "Supplier statement", "Supplier", "Bought on credit", "Bought"
	}
	p := newPage("Statement — " + in.CustomerName)
	p.header(in.ShopName, in.ShopLine, title, period(s)+"\nIssued "+day(s.GeneratedAt))

	p.font("", 8.5, muted)
	p.CellFormat(inner, 4.5, party, "", 2, "L", false, 0, "")
	p.font("B", 11, ink)
	who := in.CustomerName
	if in.Customer != "" {
		who += "  ·  " + in.Customer
	}
	p.CellFormat(inner, 6, p.text(who), "", 2, "L", false, 0, "")
	p.Ln(3)

	// Opening, in, out, closing.
	y := p.GetY()
	w := inner / 4
	p.figure(margin, y, w, "Opening balance", money.Ngultrum(s.OpeningCents, false), ink)
	p.figure(margin+w, y, w, taken, money.Ngultrum(s.CreditCents, false), owed)
	p.figure(margin+2*w, y, w, "Paid", money.Ngultrum(s.PaymentCents, false), paid)
	closing := "Closing balance"
	if s.ClosingCents < 0 {
		closing = "Closing (paid in advance)"
	}
	p.figure(margin+3*w, y, w, closing, money.Ngultrum(s.ClosingCents, false), ink)
	p.SetY(y + 15)
	p.hr()

	// The table.
	cols := []float64{24, 66, 28, 28, 32}
	heads := []string{"Date", "Description", takenColumn, "Paid", "Balance"}
	aligns := []string{"L", "L", "R", "R", "R"}
	head := func() {
		p.font("B", 8.5, muted)
		for i, h := range heads {
			p.CellFormat(cols[i], 6, h, "", 0, aligns[i], false, 0, "")
		}
		p.Ln(7)
	}
	head()
	row := func(date, what, credit, payment, balance string, bold bool) {
		if p.GetY() > 270 {
			p.AddPage()
			head()
		}
		style := ""
		if bold {
			style = "B"
		}
		p.font(style, 9, ink)
		p.CellFormat(cols[0], 6, p.text(date), "", 0, "L", false, 0, "")
		p.CellFormat(cols[1], 6, p.text(clip(what, 44)), "", 0, "L", false, 0, "")
		p.font(style, 9, owed)
		p.CellFormat(cols[2], 6, p.text(credit), "", 0, "R", false, 0, "")
		p.font(style, 9, paid)
		p.CellFormat(cols[3], 6, p.text(payment), "", 0, "R", false, 0, "")
		p.font("B", 9, ink)
		p.CellFormat(cols[4], 6, p.text(balance), "", 1, "R", false, 0, "")
	}
	opening := "Opening balance"
	if s.From != nil {
		opening = "Balance on " + day(*s.From)
	}
	row("", opening, "", "", money.Ngultrum(s.OpeningCents, false), false)
	for _, r := range s.Rows {
		what := "Goods on credit"
		if in.Supplier {
			what = "Bought on credit"
		}
		if r.Description != nil && *r.Description != "" {
			what = *r.Description
		} else if r.Kind == "payment" {
			what = "Payment"
		}
		if r.PaymentMethod != nil && *r.PaymentMethod != "" {
			what += " · " + *r.PaymentMethod
		}
		credit, payment := "", ""
		if r.SignedAmountCents > 0 {
			credit = money.Ngultrum(r.AmountCents, false)
		} else {
			payment = money.Ngultrum(r.AmountCents, false)
		}
		balance := ""
		if r.RunningBalanceCents != nil {
			balance = money.Ngultrum(*r.RunningBalanceCents, false)
		}
		row(day(r.OccurredAt), what, credit, payment, balance, false)
	}
	if len(s.Rows) == 0 {
		row("", "No entries in this period", "", "", "", false)
	}
	p.Ln(1)
	p.hr()
	row("", "Closing balance", money.Ngultrum(s.CreditCents, false), money.Ngultrum(s.PaymentCents, false), money.Ngultrum(s.ClosingCents, false), true)

	p.Ln(6)
	p.font("", 8, muted)
	footnote := "Amounts in Ngultrum. Entries the shop crossed out are left out, as they are from the balance. " +
		"Questions about this statement go to " + in.ShopName + "."
	if in.Supplier {
		footnote = "Amounts in Ngultrum, from " + in.ShopName + "'s own record of what it bought from and paid " + in.CustomerName + ". Crossed-out entries are left out."
	}
	p.MultiCell(inner, 4, p.text(footnote), "", "L", false)
	return p.bytes()
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}
