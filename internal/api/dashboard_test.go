package api_test

import (
	"fmt"
	"testing"
	"time"
)

// The owner's dashboard adds up to what the statements say: outstanding is
// the sum of what each customer owes, today counts only today, crossed-out
// entries count nowhere, and a customer who paid in advance owes nothing.
func TestTheDashboardReconcilesWithTheBook(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	pema, dorji, sonam := owner.addCustomer("Pema"), owner.addCustomer("Dorji"), owner.addCustomer("Sonam")
	now := time.Now().UTC().Format(time.RFC3339)
	long := time.Now().AddDate(0, 0, -45).UTC().Format(time.RFC3339)

	record := func(account int64, kind, amount, at string) int64 {
		t.Helper()
		r := owner.post(fmt.Sprintf("/api/accounts/%d/%s", account, kind), map[string]any{"amount": amount, "occurred_at": at})
		equal(t, r.Status, 200, "recorded "+kind)
		return r.num("transaction_id")
	}
	record(pema, "credits", "1000.50", now)
	record(pema, "payments", "200", now)
	record(dorji, "credits", "500", long) // overdue: nothing for 45 days, the shop allows 30
	mistake := record(dorji, "credits", "999", now)
	equal(t, owner.post(fmt.Sprintf("/api/transactions/%d/cross_out", mistake), nil).Status, 200, "crossed out")
	record(sonam, "payments", "50", now) // paid in advance

	d := owner.get("/api/dashboard")
	statements := owner.get(fmt.Sprintf("/api/accounts/%d/statement", pema)).num("account.balance_cents") +
		owner.get(fmt.Sprintf("/api/accounts/%d/statement", dorji)).num("account.balance_cents")
	equal(t, d.num("total_outstanding_cents"), statements, "outstanding is what the statements owe")
	equal(t, d.num("total_outstanding_cents"), int64(80050+50000), "Nu 800.50 + Nu 500")
	equal(t, d.num("owing_count"), int64(2), "two owe; the one in credit does not")
	equal(t, d.num("overdue_count"), int64(1), "one overdue")
	equal(t, d.num("overdue_cents"), int64(50000), "overdue amount")
	equal(t, d.num("credit_today_cents"), int64(100050), "credit today, without the crossed-out one")
	equal(t, d.num("payments_today_cents"), int64(25000), "payments today")
	equal(t, d.len("trend"), 14, "two weeks of trend")
	equal(t, d.num("trend.13.payment_cents"), int64(25000), "today is the last day of the trend")
	equal(t, d.str("top_accounts.0.customer_name"), "Pema", "largest balance first")
	equal(t, d.len("top_accounts"), 2, "only those who owe")

	// Another shop's dashboard sees none of it.
	other := a.browser()
	other.openShop("Dorji", "dorji@shop.bt")
	equal(t, other.get("/api/dashboard").num("total_outstanding_cents"), int64(0), "shops are separate")
}
