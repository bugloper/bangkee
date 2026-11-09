package api_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// The supplier book adds up on its own, never into what customers owe; it
// is the shop's alone; entries are crossed out, not deleted; a replay is
// recorded once; and its statement adds up like a customer's.
func TestTheSupplierBookIsKeptApart(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	customer := owner.addCustomer("Pema")
	owner.post(fmt.Sprintf("/api/accounts/%d/credits", customer), map[string]any{"amount": "500"})

	created := owner.post("/api/suppliers", map[string]any{"name": "Druk Wholesale", "phone": "17 22 33 44"})
	equal(t, created.Status, 200, "supplier added")
	equal(t, owner.post("/api/suppliers", map[string]any{"name": "druk wholesale"}).Status, 422, "one supplier per name")
	id := created.num("supplier_id")
	path := func(suffix string) string { return fmt.Sprintf("/api/suppliers/%d%s", id, suffix) }

	equal(t, owner.post(path("/purchases"), map[string]any{"amount": "10000", "description": "Rice, 20 bags", "occurred_at": "2026-10-02T10:00:00+06:00"}).Status, 200, "bought on credit")
	first := owner.post(path("/payments"), map[string]any{"amount": "4000", "payment_method": "mBoB", "idempotency_key": "sup-1", "occurred_at": "2026-10-20T10:00:00+06:00"})
	equal(t, first.get("duplicate"), any(false), "paid")
	equal(t, owner.post(path("/payments"), map[string]any{"amount": "4000", "idempotency_key": "sup-1"}).get("duplicate"), any(true), "a replay is recorded once")
	owner.post(path("/purchases"), map[string]any{"amount": "2500.50", "occurred_at": "2026-11-03T10:00:00+06:00"})

	book := owner.get(path(""))
	equal(t, book.num("supplier.balance_cents"), int64(850_050), "owed to the supplier: 10,000 − 4,000 + 2,500.50")
	equal(t, owner.get("/api/suppliers").num("total_payable_cents"), int64(850_050), "total payable")
	equal(t, owner.get("/api/dashboard").num("total_outstanding_cents"), int64(50_000), "what customers owe is untouched")
	equal(t, owner.balance(customer), int64(50_000), "and the customer's balance too")

	statement := owner.get(path("/statement?from=2026-10-15&to=2026-11-30"))
	equal(t, statement.num("statement.opening_cents"), int64(1_000_000), "owed before the 15th")
	equal(t, statement.num("statement.credit_cents"), int64(250_050), "bought in range")
	equal(t, statement.num("statement.payment_cents"), int64(400_000), "paid in range")
	equal(t, statement.num("statement.closing_cents"), int64(850_050), "closing")
	status, header, body := owner.raw(path("/statement.pdf"))
	equal(t, status, 200, "PDF")
	equal(t, header.Get("Content-Type"), "application/pdf", "a PDF")
	equal(t, strings.HasPrefix(body, "%PDF-"), true, "really a PDF")

	// Crossed out, not deleted; the balance follows.
	entry := book.num("ledger.0.id")
	equal(t, owner.post(fmt.Sprintf("/api/supplier_entries/%d/cross_out", entry), nil).Status, 200, "crossed out")
	equal(t, owner.get(path("")).num("supplier.balance_cents"), int64(600_000), "without the crossed-out purchase")
	equal(t, owner.get(path("")).len("ledger"), 3, "still on the record")
	equal(t, owner.delete(path("")).Status, 422, "cannot remove a supplier still owed")

	// Nobody else sees it: another shop, a customer.
	other := a.browser()
	other.openShop("Dorji", "dorji@shop.bt")
	equal(t, other.get(path("")).Status, 404, "not another shop's")
	equal(t, other.post(path("/purchases"), map[string]any{"amount": "1"}).Status, 404, "nor write to it")
	equal(t, other.post(fmt.Sprintf("/api/supplier_entries/%d/cross_out", entry), nil).Status, 404, "nor cross out its entries")
	equal(t, other.get("/api/suppliers").len("suppliers"), 0, "its own list is empty")
	pema := a.browser()
	pema.join(owner.invitePath(customer), "Pema", "pema@example.bt")
	equal(t, pema.get("/api/suppliers").Status, 403, "customers have no supplier book")

	// On Basic, the book stays readable but takes no new entries.
	_, _ = a.DB.Exec(context.Background(), "UPDATE subscriptions SET status = 1, plan = 'basic', current_period_end = now() + interval '300 days' WHERE shop_id = (SELECT shop_id FROM suppliers WHERE id = $1)", id)
	equal(t, owner.get(path("")).Status, 200, "still readable")
	equal(t, owner.post(path("/purchases"), map[string]any{"amount": "1"}).str("code"), "plan_required", "no new entries")
}
