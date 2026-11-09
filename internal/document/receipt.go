package document

import (
	"bangkee/internal/domain"
	"bangkee/internal/money"
)

// Receipt is a payment's receipt as a PDF: one half-page, the amount large.
func Receipt(r domain.Receipt) ([]byte, error) {
	p := newPage("Receipt " + r.Number)
	p.header(r.ShopName, r.ShopLine, "Payment receipt", "No. "+r.Number+"\n"+day(r.PaidAt)+", "+r.PaidAt.In(domain.Thimphu).Format("3:04 PM"))

	if r.Void {
		p.font("B", 11, owed)
		voided := "VOID — this payment was crossed out by the shop"
		if r.VoidedAt != nil {
			voided += " on " + day(*r.VoidedAt)
		}
		p.MultiCell(inner, 6, p.text(voided+". It no longer counts toward the balance."), "", "L", false)
		p.Ln(3)
	}

	p.font("", 9, muted)
	p.CellFormat(inner, 5, "Received from", "", 2, "L", false, 0, "")
	p.font("B", 12, ink)
	who := r.CustomerName
	if r.CustomerPhone != nil && *r.CustomerPhone != "" {
		who += "  ·  " + *r.CustomerPhone
	}
	p.CellFormat(inner, 7, p.text(who), "", 2, "L", false, 0, "")
	p.Ln(4)

	p.font("", 9, muted)
	p.CellFormat(inner, 5, "Amount paid", "", 2, "L", false, 0, "")
	p.font("B", 26, paid)
	p.CellFormat(inner, 13, p.text(money.Ngultrum(r.AmountCents, false)), "", 2, "L", false, 0, "")
	p.Ln(3)
	p.hr()

	line := func(label, value string) {
		p.font("", 10, muted)
		p.CellFormat(50, 7, p.text(label), "", 0, "L", false, 0, "")
		p.font("", 10, ink)
		p.MultiCell(inner-50, 7, p.text(value), "", "L", false)
	}
	method := "Not recorded"
	if r.PaymentMethod != nil && *r.PaymentMethod != "" {
		method = *r.PaymentMethod
	}
	line("Paid by", method)
	line("Received by", r.ReceivedBy)
	if r.BalanceAfterCents != nil {
		balance := money.Ngultrum(*r.BalanceAfterCents, false)
		switch {
		case *r.BalanceAfterCents == 0:
			balance += " — settled"
		case *r.BalanceAfterCents < 0:
			balance += " — paid in advance"
		}
		line("Balance after this payment", balance)
	}
	if r.Notes != nil && *r.Notes != "" {
		line("Notes", *r.Notes)
	}
	p.Ln(4)
	p.hr()
	p.font("", 8, muted)
	p.MultiCell(inner, 4, p.text("This receipt is drawn from "+r.ShopName+"'s Bangkee book. The balance shown is as it stood right after this payment; "+
		"later credits and payments change it. Keep the receipt number to ask about this payment."), "", "L", false)
	return p.bytes()
}
