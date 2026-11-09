package api_test

import (
	"fmt"
	"strings"
	"testing"
)

// A sale paid on the spot is the shop's own record: it counts in the day's
// takings, never in anyone's balance, and no customer can see it.
func TestSalesAreTheShopsOwnRecordOfItsTakings(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	pema := owner.addCustomer("Pema")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/credits", pema), map[string]any{"amount": "500"}).Status, 200, "a credit")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/payments", pema), map[string]any{"amount": "200"}).Status, 200, "and a payment on it")

	cash := owner.post("/api/sales", map[string]any{"amount": "120", "payment_method": "Cash", "description": "Biscuits", "idempotency_key": "k1"})
	equal(t, cash.Status, 200, "a cash sale")
	equal(t, cash.str("notice"), "Sale of Nu. 120 recorded.", "said so")
	equal(t, owner.post("/api/sales", map[string]any{"amount": "120", "payment_method": "Cash", "idempotency_key": "k1"}).get("duplicate"), any(true), "a replay records nothing")

	itemized := owner.post("/api/sales", map[string]any{
		"itemized": true, "payment_method": "Mobile transfer", "account_id": pema,
		"line_items": []map[string]any{{"name": "Rice 5 kg", "quantity": "2", "unit_price": "350"}, {"name": "Salt", "quantity": "1", "unit_price": "25"}},
	})
	equal(t, itemized.Status, 200, "an itemized sale to a named customer")
	equal(t, itemized.str("notice"), "Sale of Nu. 725 recorded.", "the items are the amount")

	equal(t, owner.balance(pema), int64(30_000), "a sale never touches the customer's balance")
	equal(t, owner.post("/api/sales", map[string]any{"amount": "0", "payment_method": "Cash"}).Status, 422, "an amount")
	equal(t, owner.post("/api/sales", map[string]any{"amount": "10", "payment_method": "Credit"}).Status, 422, "paid now, by a known method")
	equal(t, owner.post("/api/sales", map[string]any{"itemized": true, "payment_method": "Cash"}).Status, 422, "an itemized sale has items")

	day := owner.get("/api/sales")
	equal(t, day.len("day.sales"), 2, "today's sales")
	equal(t, day.str("day.sales.0.customer_name"), "Pema", "the customer named on it")
	equal(t, day.len("day.sales.0.items"), 2, "with what was sold")
	equal(t, day.num("day.sales_cents"), int64(84_500), "sales")
	equal(t, day.str("day.by_method.0.method"), "Mobile transfer", "mobile transfer first")
	equal(t, day.num("day.by_method.0.cents"), int64(72_500), "by mobile transfer")
	equal(t, day.num("day.by_method.1.cents"), int64(12_000), "in cash")
	equal(t, day.num("day.collected_cents"), int64(20_000), "collected on credit")
	equal(t, day.num("day.credit_cents"), int64(50_000), "given on credit")
	equal(t, day.num("day.takings_cents"), int64(104_500), "takings: sales and collections")

	dashboard := owner.get("/api/dashboard")
	equal(t, dashboard.num("sales_today_cents"), int64(84_500), "on the dashboard")
	equal(t, dashboard.num("sales_month_cents"), int64(84_500), "this month")

	insights := owner.get("/api/insights")
	equal(t, insights.len("sales"), 2, "Insights lists the month's sales")
	equal(t, insights.num(fmt.Sprintf("months.%d.sales_cents", insights.len("months")-1)), int64(84_500), "and this month's total")
	equal(t, owner.post(fmt.Sprintf("/api/sales/%d/cross_out", cash.num("sale_id")), nil).Status, 200, "crossed out")
	equal(t, owner.post(fmt.Sprintf("/api/sales/%d/cross_out", cash.num("sale_id")), nil).Status, 422, "once")
	day = owner.get("/api/sales")
	equal(t, day.num("day.sales_cents"), int64(72_500), "out of the takings")
	equal(t, day.len("day.sales"), 2, "but still on the record")

	// The customer cannot see any of it; another shop cannot touch it.
	phone := a.browser()
	phone.join(owner.invitePath(pema), "Pema", "pema@example.bt")
	equal(t, phone.get("/api/sales").Status, 403, "customers do not see the shop's sales")
	other := a.browser()
	other.openShop("Dorji", "dorji@shop.bt")
	equal(t, other.get("/api/sales").len("day.sales"), 0, "another shop sees only its own")
	equal(t, other.post(fmt.Sprintf("/api/sales/%d/cross_out", itemized.num("sale_id")), nil).Status, 404, "nor crosses out ours")
	r := other.post("/api/sales", map[string]any{"amount": "10", "payment_method": "Cash", "account_id": pema})
	equal(t, r.Status, 422, "nor names our customer")
	equal(t, strings.Contains(r.str("error"), "not in your book"), true, "said why: "+r.str("error"))
}

// Staff: a cashier records sales, a manager crosses them out, read-only staff look.
func TestStaffRecordSalesByRole(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	join := func(name, email, role string) *browser {
		t.Helper()
		r := owner.post("/api/staff/invitations", map[string]any{"name": name, "email_address": email, "role": role})
		b := a.browser()
		equal(t, b.joinStaff(r.str("join_path"), name).Status, 200, name+" joined")
		return b
	}
	manager, cashier, viewer := join("Sonam", "sonam@shop.bt", "manager"), join("Dawa", "dawa@shop.bt", "cashier"), join("Tashi", "tashi@shop.bt", "viewer")

	sale := cashier.post("/api/sales", map[string]any{"amount": "60", "payment_method": "Cash"})
	equal(t, sale.Status, 200, "the cashier records a sale")
	equal(t, owner.get("/api/sales").str("day.sales.0.created_by_name"), "Dawa", "under the cashier's name")
	equal(t, viewer.post("/api/sales", map[string]any{"amount": "60", "payment_method": "Cash"}).Status, 403, "read-only staff cannot record")
	equal(t, viewer.get("/api/sales").len("day.sales"), 1, "but can look")
	path := fmt.Sprintf("/api/sales/%d/cross_out", sale.num("sale_id"))
	equal(t, cashier.post(path, nil).Status, 403, "the cashier cannot cross one out")
	equal(t, manager.post(path, nil).Status, 200, "the manager can")
}
