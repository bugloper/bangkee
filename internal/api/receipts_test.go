package api_test

import (
	"fmt"
	"strings"
	"testing"
)

// Every payment has a receipt: its number, the amount, how it was paid and
// the balance right after it. Credits have none, a crossed-out payment's is
// void, and only the shop and the customer can open one.
func TestEveryPaymentHasAReceipt(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Pema")
	post := func(kind string, body map[string]any) int64 {
		t.Helper()
		r := owner.post(fmt.Sprintf("/api/accounts/%d/%s", account, kind), body)
		equal(t, r.Status, 200, "recorded")
		return r.num("transaction_id")
	}
	credit := post("credits", map[string]any{"amount": "1000", "occurred_at": "2026-10-01T10:00:00+06:00"})
	first := post("payments", map[string]any{"amount": "300.50", "payment_method": "mBoB", "notes": "Thank you", "occurred_at": "2026-10-05T10:00:00+06:00"})
	second := post("payments", map[string]any{"amount": "699.50", "occurred_at": "2026-10-09T10:00:00+06:00"})
	post("credits", map[string]any{"amount": "50", "occurred_at": "2026-10-10T10:00:00+06:00"})

	r := owner.get(fmt.Sprintf("/api/transactions/%d/receipt", first))
	equal(t, r.Status, 200, "a receipt")
	equal(t, strings.HasPrefix(r.str("receipt.number"), "R"), true, "numbered")
	equal(t, r.num("receipt.amount_cents"), int64(30_050), "amount")
	equal(t, r.str("receipt.payment_method"), "mBoB", "method")
	equal(t, r.str("receipt.notes"), "Thank you", "notes")
	equal(t, r.num("receipt.balance_after_cents"), int64(69_950), "balance right after, not today's")
	equal(t, owner.get(fmt.Sprintf("/api/transactions/%d/receipt", second)).num("receipt.balance_after_cents"), int64(0), "settled")
	equal(t, owner.get(fmt.Sprintf("/api/transactions/%d/receipt", first)).str("receipt.number"), r.str("receipt.number"), "the same number every time")
	equal(t, owner.get(fmt.Sprintf("/api/transactions/%d/receipt", credit)).Status, 404, "credits have no receipt")
	equal(t, owner.get("/api/transactions/999999/receipt").Status, 404, "no such payment, no receipt")

	status, header, body := owner.raw(fmt.Sprintf("/api/transactions/%d/receipt.pdf", first))
	equal(t, status, 200, "PDF")
	equal(t, header.Get("Content-Type"), "application/pdf", "a PDF")
	equal(t, strings.HasPrefix(body, "%PDF-"), true, "really a PDF")

	list := owner.get(fmt.Sprintf("/api/accounts/%d/receipts", account))
	equal(t, list.len("receipts"), 2, "receipt history: the payments only")
	equal(t, list.num("receipts.0.transaction_id"), second, "newest first")

	// Crossed out: the receipt says void, and has no balance to state.
	owner.post(fmt.Sprintf("/api/transactions/%d/cross_out", first), nil)
	void := owner.get(fmt.Sprintf("/api/transactions/%d/receipt", first))
	equal(t, void.get("receipt.void"), any(true), "void")
	equal(t, void.get("receipt.balance_after_cents"), nil, "no balance on a void receipt")

	// The customer can open theirs; another shop and strangers cannot.
	pema := a.browser()
	pema.join(owner.invitePath(account), "Pema", "pema@example.bt")
	equal(t, pema.get(fmt.Sprintf("/api/transactions/%d/receipt", second)).Status, 200, "the customer's receipt")
	equal(t, pema.get(fmt.Sprintf("/api/accounts/%d/receipts", account)).Status, 200, "the customer's history")
	other := a.browser()
	other.openShop("Dorji", "dorji@shop.bt")
	equal(t, other.get(fmt.Sprintf("/api/transactions/%d/receipt", second)).Status, 404, "not another shop's")
	status, _, _ = other.raw(fmt.Sprintf("/api/transactions/%d/receipt.pdf", second))
	equal(t, status, 404, "nor its PDF")
	equal(t, a.browser().get(fmt.Sprintf("/api/transactions/%d/receipt", second)).Status, 401, "signed out")
}
