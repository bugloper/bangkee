package api_test

import (
	"fmt"
	"testing"
)

// The customer confirms or flags what the shop recorded; flagging never
// moves the balance; the shop sees the flag and can answer or fix it; and
// nobody but the account's own customer can confirm its entries.
func TestCustomersConfirmAndFlagEntriesWithoutTouchingTheBalance(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Pema")
	credit := func(amount string) int64 {
		t.Helper()
		return owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": amount}).num("transaction_id")
	}
	rice, oil, sugar := credit("1200"), credit("300"), credit("80")
	pay := owner.post(fmt.Sprintf("/api/accounts/%d/payments", account), map[string]any{"amount": "100"}).num("transaction_id")
	entryState := func(who *browser, id int64) string {
		t.Helper()
		ledger := who.get(fmt.Sprintf("/api/accounts/%d", account))
		for i := 0; i < ledger.len("ledger"); i++ {
			if ledger.num(fmt.Sprintf("ledger.%d.id", i)) == id {
				return ledger.str(fmt.Sprintf("ledger.%d.confirmation", i))
			}
		}
		return "missing"
	}
	equal(t, entryState(owner, rice), "pending", "new entries wait for the customer")

	pema := a.browser()
	pema.join(owner.invitePath(account), "Pema", "pema@example.bt")
	path := func(id int64, action string) string { return fmt.Sprintf("/api/transactions/%d/%s", id, action) }

	// Strangers, the shop itself and other customers cannot confirm for Pema.
	equal(t, owner.post(path(rice, "confirm"), nil).Status, 404, "the shop cannot confirm for the customer")
	stranger := a.browser()
	stranger.join(owner.invitePath(owner.addCustomer("Dorji")), "Dorji", "dorji@example.bt")
	equal(t, stranger.post(path(rice, "confirm"), nil).Status, 404, "another customer cannot")
	equal(t, stranger.post(path(rice, "dispute"), map[string]any{"reason": "no"}).Status, 404, "nor flag it")

	equal(t, pema.post(path(rice, "confirm"), nil).Status, 200, "confirmed")
	equal(t, pema.post(path(rice, "confirm"), nil).Status, 422, "confirming twice changes nothing")
	equal(t, entryState(owner, rice), "confirmed", "the shop sees it confirmed")

	before := owner.balance(account)
	equal(t, pema.post(path(oil, "dispute"), map[string]any{"reason": " "}).Status, 422, "a flag needs a reason")
	equal(t, pema.post(path(oil, "dispute"), map[string]any{"reason": "I took one bottle, not two"}).Status, 200, "flagged")
	equal(t, owner.balance(account), before, "a flag does not move the balance")
	equal(t, entryState(pema, oil), "disputed", "the customer sees it flagged")

	d := owner.get("/api/dashboard")
	equal(t, d.len("disputed"), 1, "the shop's dashboard lists the flag")
	equal(t, d.num("disputed.0.id"), oil, "which entry")
	notes := owner.get("/api/notifications")
	equal(t, notes.str("notifications.0.kind"), "dispute", "the shop was told")

	// The shop answers: back to the customer, the history keeps both sides.
	equal(t, owner.post(path(oil, "dispute_reply"), map[string]any{"note": "You took two — see the line items"}).Status, 200, "replied")
	equal(t, entryState(pema, oil), "pending", "waiting for the customer again")
	equal(t, pema.post(path(oil, "dispute_reply"), map[string]any{"note": "x"}).Status, 403, "customers do not reply as the shop")

	// The shop fixes a flagged entry instead: it waits for the customer again.
	equal(t, pema.post(path(oil, "dispute"), map[string]any{"reason": "Still one bottle"}).Status, 200, "flagged again")
	equal(t, owner.patch(fmt.Sprintf("/api/transactions/%d", oil), map[string]any{"amount": "150"}).Status, 200, "the shop corrects it")
	equal(t, entryState(pema, oil), "pending", "a changed entry is asked about again")
	ledger := pema.get(fmt.Sprintf("/api/accounts/%d", account))
	for i := 0; i < ledger.len("ledger"); i++ {
		if ledger.num(fmt.Sprintf("ledger.%d.id", i)) == oil {
			equal(t, ledger.len(fmt.Sprintf("ledger.%d.responses", i)), 4, "disputed, replied, disputed, changed")
			equal(t, ledger.str(fmt.Sprintf("ledger.%d.responses.0.note", i)), "I took one bottle, not two", "the reason is kept")
		}
	}

	// Crossed out: nothing to confirm.
	owner.post(path(sugar, "cross_out"), nil)
	equal(t, pema.post(path(sugar, "confirm"), nil).Status, 422, "crossed-out entries are not confirmed")

	all := pema.post(fmt.Sprintf("/api/accounts/%d/confirm_all", account), nil)
	equal(t, all.num("confirmed"), int64(2), "the changed entry and the payment")
	equal(t, entryState(owner, pay), "confirmed", "payment confirmed")
	equal(t, stranger.post(fmt.Sprintf("/api/accounts/%d/confirm_all", account), nil).Status, 404, "not someone else's account")
	equal(t, owner.get("/api/dashboard").len("disputed"), 0, "nothing flagged now")
}
