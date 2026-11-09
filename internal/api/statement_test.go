package api_test

import (
	"fmt"
	"strings"
	"testing"
)

// A statement for a range of days opens with what was owed before it,
// closes with opening + credit − paid, and comes as a PDF to the shop and
// the customer — nobody else.
func TestAStatementForARangeOfDaysAddsUpAndDownloads(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Pema")
	at := func(kind, amount, when string) {
		t.Helper()
		r := owner.post(fmt.Sprintf("/api/accounts/%d/%s", account, kind), map[string]any{"amount": amount, "occurred_at": when})
		equal(t, r.Status, 200, "recorded")
	}
	at("credits", "1000", "2026-09-05T10:00:00+06:00")
	at("payments", "400", "2026-09-20T10:00:00+06:00")
	at("credits", "250.75", "2026-10-01T00:30:00+06:00") // just after midnight in Thimphu: October
	at("payments", "100", "2026-10-31T23:30:00+06:00")
	at("credits", "60", "2026-11-02T09:00:00+06:00")

	october := owner.get(fmt.Sprintf("/api/accounts/%d/statement?from=2026-10-01&to=2026-10-31", account))
	equal(t, october.num("statement.opening_cents"), int64(60_000), "opening: owed before October")
	equal(t, october.len("statement.rows"), 2, "October's entries")
	equal(t, october.num("statement.credit_cents"), int64(25_075), "credit in October")
	equal(t, october.num("statement.payment_cents"), int64(10_000), "paid in October")
	equal(t, october.num("statement.closing_cents"), int64(75_075), "closing")
	equal(t, october.num("statement.rows.1.running_balance_cents"), int64(75_075), "the last row's balance is the closing")

	whole := owner.get(fmt.Sprintf("/api/accounts/%d/statement", account))
	equal(t, whole.num("statement.closing_cents"), owner.balance(account), "no range: closing is today's balance")

	bad := owner.get(fmt.Sprintf("/api/accounts/%d/statement?from=2026-10-31&to=2026-10-01", account))
	equal(t, bad.Status, 422, "the end before the start")

	status, header, body := owner.raw(fmt.Sprintf("/api/accounts/%d/statement.pdf?from=2026-10-01&to=2026-10-31", account))
	equal(t, status, 200, "the PDF")
	equal(t, header.Get("Content-Type"), "application/pdf", "a PDF")
	equal(t, strings.HasPrefix(body, "%PDF-"), true, "really a PDF")
	equal(t, strings.Contains(header.Get("Content-Disposition"), "attachment"), true, "a download")

	// The customer gets the same; another shop and a stranger get nothing.
	pema := a.browser()
	pema.join(owner.invitePath(account), "Pema", "pema@example.bt")
	status, _, _ = pema.raw(fmt.Sprintf("/api/accounts/%d/statement.pdf", account))
	equal(t, status, 200, "the customer's own statement")
	other := a.browser()
	other.openShop("Dorji", "dorji@shop.bt")
	status, _, _ = other.raw(fmt.Sprintf("/api/accounts/%d/statement.pdf", account))
	equal(t, status, 403, "not another shop's")
	status, _, _ = a.browser().raw(fmt.Sprintf("/api/accounts/%d/statement.pdf", account))
	equal(t, status, 401, "not a stranger's")
}
