package api_test

// Identity and the book itself: BR-6..BR-16, BR-24..BR-26.

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestSignedOutPeopleGet401AndBadPasswordsAreRefused(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")

	visitor := a.browser()
	equal(t, visitor.get("/api/me").Status, 401, "signed out")

	wrong := visitor.post("/api/session", map[string]any{"email_address": "karma@shop.bt", "password": "nope"})
	equal(t, wrong.Status, 422, "wrong password status")
	equal(t, wrong.str("error"), "Try another email address or password.", "wrong password")

	// Email is normalised the way Rails' `normalizes` did.
	equal(t, visitor.signIn("  KARMA@shop.bt ").Status, 200, "sign in")
	me := visitor.get("/api/me")
	equal(t, me.str("user.role"), "shop_owner", "role")
	equal(t, me.str("subscription.status"), "trialing", "subscription")
	equal(t, me.str("subscription.summary"), "14 days of free trial left", "summary")

	equal(t, visitor.delete("/api/session").Status, 200, "sign out")
	equal(t, visitor.get("/api/me").Status, 401, "signed out again")
}

func TestAShopNeedsANameAndAnEmailIsTakenOnce(t *testing.T) {
	a := newApp(t)
	a.browser().openShop("Karma", "karma@shop.bt")

	second := a.browser()
	nameless := second.post("/api/registration", map[string]any{"name": "Pema", "email_address": "p@x.bt", "password": "pw"})
	equal(t, fmt.Sprint(nameless.get("errors")), "[Your shop needs a name]", "nameless shop")

	taken := second.post("/api/registration", map[string]any{"name": "K", "shop_name": "S", "email_address": "Karma@Shop.bt", "password": "pw"})
	equal(t, fmt.Sprint(taken.get("errors")), "[Email address has already been taken]", "taken email")
}

func TestStateChangingCallsNeedTheAppHeader(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	// A form posted from another site carries the cookie but cannot set the header.
	forged, _ := http.NewRequest("POST", owner.app.server.URL+"/api/accounts", strings.NewReader("customer_name=Forged"))
	forged.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	equal(t, owner.do(forged).Status, 403, "no header")
}

func TestCreditsAndPaymentsMoveTheBalanceAndVoidsDoNotCount(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Tashi Wangmo")

	credit := owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "1,250.50", "description": "Rice"})
	equal(t, credit.str("notice"), "Credit of Nu. 1,250.50 recorded.", "credit")
	payment := owner.post(fmt.Sprintf("/api/accounts/%d/payments", account), map[string]any{"amount": "250.50", "payment_method": "Cash"})
	equal(t, payment.str("notice"), "Payment of Nu. 250.50 recorded.", "payment")
	equal(t, owner.balance(account), 100_000, "balance")

	// Nothing, or nonsense, is not an amount.
	zero := owner.post(fmt.Sprintf("/api/accounts/%d/payments", account), map[string]any{"amount": "0"})
	equal(t, fmt.Sprint(zero.get("errors")), "[Amount must be greater than 0]", "zero")

	// BR-15: a void keeps the row and takes it out of the balance.
	creditID := credit.num("transaction_id")
	void := owner.post(fmt.Sprintf("/api/transactions/%d/void", creditID), map[string]any{})
	equal(t, void.str("notice"), "Transaction voided. It stays on the record.", "void")
	equal(t, owner.balance(account), -25_050, "balance after void")
	again := owner.post(fmt.Sprintf("/api/transactions/%d/void", creditID), map[string]any{})
	equal(t, again.str("error"), "That transaction was already voided.", "void twice")

	// BR-10/11: newest first, the voided row kept with no running balance.
	detail := owner.get(fmt.Sprintf("/api/accounts/%d", account))
	equal(t, detail.len("ledger"), 2, "ledger rows")
	equal(t, detail.str("ledger.0.kind"), "payment", "newest first")
	equal(t, detail.num("ledger.0.running_balance_cents"), -25_050, "running balance")
	equal(t, detail.get("ledger.1.voided"), any(true), "voided row kept")
	equal(t, detail.get("ledger.1.running_balance_cents"), nil, "voided row has no balance")
	equal(t, detail.str("audit_events.0.action"), "account_created", "audit")
}

func TestAReplayedOfflineEntryIsRecordedOnce(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Pema")
	entry := map[string]any{"amount": "300", "idempotency_key": "queued-1", "occurred_at": "2026-09-01T10:00:00Z"}

	first := owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), entry)
	equal(t, first.get("duplicate"), any(false), "first")
	replay := owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), entry)
	equal(t, replay.get("duplicate"), any(true), "replay")
	equal(t, replay.str("notice"), "That entry was already recorded.", "replay notice")
	equal(t, owner.balance(account), 30_000, "balance")

	// It is dated when it happened, not when the signal came back.
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d", account)).str("ledger.0.occurred_at"), "2026-09-01T10:00:00Z", "dated")
}

func TestAnItemizedCreditIsTheSumOfItsLines(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Ugyen")

	credit := owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{
		"itemized": true,
		"amount":   "1", // ignored: BR-12
		"line_items": []map[string]string{
			{"name": "Rice 25 kg", "quantity": "1", "unit_price": "620"},
			{"name": "Oil", "quantity": "1.5", "unit_price": "0.33"},
			{"name": "", "quantity": "1", "unit_price": ""},
		},
	})
	// 1.5 × 33 chetrum = 49.5, rounded half away from zero.
	equal(t, credit.str("notice"), "Credit of Nu. 620.50 recorded.", "itemized")
	detail := owner.get(fmt.Sprintf("/api/accounts/%d", account))
	equal(t, detail.len("ledger.0.line_items"), 2, "lines")
	equal(t, detail.str("ledger.0.line_items.1.quantity_label"), "1.5", "quantity label")

	// Editing keeps the items as the source of truth.
	owner.patch(fmt.Sprintf("/api/transactions/%d", detail.num("ledger.0.id")), map[string]any{"amount": "5"})
	equal(t, owner.balance(account), 62_050, "after edit")

	blank := owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{
		"itemized": true, "line_items": []map[string]string{{"name": "", "quantity": "1", "unit_price": "10"}},
	})
	equal(t, fmt.Sprint(blank.get("errors")), "[Line items name can't be blank]", "blank line name")
}

func TestCustomersJoinThroughTheInviteAndSeeOnlyTheirOwnBook(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	mine := owner.addCustomer("Dawa")
	other := owner.addCustomer("Somebody else")
	owner.post(fmt.Sprintf("/api/accounts/%d/credits", mine), map[string]any{"amount": "500"})
	invite := owner.invitePath(mine)

	customer := a.browser()
	customer.join(invite, "Dawa Tashi", "dawa@example.bt")

	// BR-26: the sign-up claimed the account, and the owner heard about it.
	equal(t, customer.get("/api/me").str("user.role"), "customer", "role")
	view := customer.get(fmt.Sprintf("/api/accounts/%d", mine))
	equal(t, view.str("viewer"), "customer", "viewer")
	equal(t, view.num("account.balance_cents"), 50_000, "balance")
	equal(t, owner.get("/api/notifications").str("notifications.0.title"), "Dawa joined", "owner told")

	forbidden := customer.get(fmt.Sprintf("/api/accounts/%d", other))
	equal(t, forbidden.Status, 403, "someone else's account")
	equal(t, forbidden.str("error"), "That account is not yours to view.", "forbidden message")

	// BR-25: owners are turned away from invite links.
	stranger := a.browser()
	stranger.openShop("Pema", "pema@shop.bt")
	refused := stranger.get("/api/invitations/" + strings.TrimPrefix(invite, "/join/"))
	equal(t, refused.str("alert"), "Invite links are for customers. Ask your customer to open it on their phone.", "owner refused")

	// The customer's credit notification landed on their bell too.
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/credits", mine), map[string]any{"amount": "20", "description": "Tea"}).Status, 200, "credit")
	bell := customer.get("/api/notifications")
	equal(t, bell.str("notifications.0.title"), "New credit at Karma's Shop", "customer told")
	equal(t, bell.str("notifications.0.body"), "Nu. 20 · Tea", "body")
}

func TestAnAccountWithABalanceCannotBeRemoved(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Kinley")
	owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "100"})

	refused := owner.delete(fmt.Sprintf("/api/accounts/%d", account))
	equal(t, refused.str("error"), "Settle the balance before removing this customer.", "refused")

	owner.post(fmt.Sprintf("/api/accounts/%d/payments", account), map[string]any{"amount": "100"})
	equal(t, owner.delete(fmt.Sprintf("/api/accounts/%d", account)).str("notice"), "Customer removed.", "removed")
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d", account)).Status, 404, "gone")
}

func TestTheStatementLeavesVoidedEntriesOut(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Sonam")
	owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "750"})
	mistake := owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "99"})
	owner.post(fmt.Sprintf("/api/transactions/%d/void", mistake.num("transaction_id")), map[string]any{})
	owner.post(fmt.Sprintf("/api/accounts/%d/payments", account), map[string]any{"amount": "250"})

	statement := owner.get(fmt.Sprintf("/api/accounts/%d/statement", account))
	equal(t, statement.len("rows"), 2, "rows")
	equal(t, statement.num("debit_cents"), 75_000, "debit")
	equal(t, statement.num("credit_cents"), 25_000, "credit")
	equal(t, statement.num("rows.1.running_balance_cents"), 50_000, "running")
}
