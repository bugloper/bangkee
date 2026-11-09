package api_test

import (
	"fmt"
	"testing"
	"time"
)

// A plan is an agreement over the book, never a second book: payments
// recorded as usual move it on, a crossed-out payment moves it back, and the
// balance is the same with or without a plan.
func TestInstallmentPlansFollowThePayments(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Pema")
	owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "1200"})
	tomorrow := time.Now().In(time.FixedZone("BTT", 6*3600)).AddDate(0, 0, 1).Format("2006-01-02")
	yesterday := time.Now().In(time.FixedZone("BTT", 6*3600)).AddDate(0, 0, -1).Format("2006-01-02")
	path := fmt.Sprintf("/api/accounts/%d/installments", account)
	plan := func(total string, count int, first string) response {
		return owner.post(path, map[string]any{"total": total, "count": count, "frequency": "monthly", "first_due_on": first})
	}

	equal(t, plan("1500", 3, tomorrow).Status, 422, "not more than is owed")
	equal(t, plan("1200", 1, tomorrow).Status, 422, "at least two installments")
	equal(t, plan("1200", 3, yesterday).Status, 422, "not starting in the past")
	before := owner.balance(account)
	equal(t, plan("1200", 3, tomorrow).Status, 200, "agreed")
	equal(t, owner.balance(account), before, "a plan does not touch the balance")
	equal(t, plan("100", 2, tomorrow).Status, 422, "one plan at a time")

	pay := func(amount string) int64 {
		return owner.post(fmt.Sprintf("/api/accounts/%d/payments", account), map[string]any{"amount": amount}).num("transaction_id")
	}
	pay("250")
	view := owner.get(path)
	equal(t, view.num("plans.0.paid_cents"), int64(25_000), "a part payment counts")
	equal(t, view.str("plans.0.installments.0.status"), "partial", "the first is partly paid")
	big := pay("600")
	view = owner.get(path)
	equal(t, view.str("plans.0.installments.0.status"), "paid", "first paid")
	equal(t, view.str("plans.0.installments.1.status"), "paid", "paying ahead covers the second")
	equal(t, view.str("plans.0.installments.2.status"), "partial", "and starts the third")
	equal(t, view.num("plans.0.remaining_cents"), int64(35_000), "remaining")

	owner.post(fmt.Sprintf("/api/transactions/%d/cross_out", big), nil)
	equal(t, owner.get(path).num("plans.0.paid_cents"), int64(25_000), "a crossed-out payment no longer counts")

	// The customer sees the plan; another shop does not.
	pema := a.browser()
	pema.join(owner.invitePath(account), "Pema", "pema@example.bt")
	equal(t, pema.get(path).num("plans.0.total_cents"), int64(120_000), "the customer sees it")
	equal(t, pema.post(path, map[string]any{"total": "10", "count": 2, "frequency": "weekly", "first_due_on": tomorrow}).Status, 403, "customers do not make plans")
	other := a.browser()
	other.openShop("Dorji", "dorji@shop.bt")
	equal(t, other.get(path).Status, 403, "another shop cannot see it")
	planID := owner.get(path).num("plans.0.id")
	equal(t, other.post(fmt.Sprintf("/api/installment_plans/%d/cancel", planID), nil).Status, 404, "nor cancel it")

	// Paid off: the plan completes, and a new one can be made later.
	pay("950")
	equal(t, owner.get(path).str("plans.0.status"), "completed", "paid in full")
	owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "400"})
	equal(t, plan("400", 2, tomorrow).Status, 200, "a new plan once the last is done")
	equal(t, owner.post(fmt.Sprintf("/api/installment_plans/%d/cancel", owner.get(path).num("plans.0.id")), nil).Status, 200, "cancelled")
	equal(t, owner.get(path).str("plans.0.status"), "cancelled", "ended")
	equal(t, owner.balance(account), int64(40_000), "the balance is the book's alone")
}
