package api_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// joinStaff opens the invitation and joins as staff.
func (b *browser) joinStaff(joinPath, name string) response {
	b.app.t.Helper()
	token := strings.TrimPrefix(joinPath, "/staff/join/")
	return b.post("/api/staff_invitations/"+token+"/accept", map[string]any{"name": name, "password": "password123"})
}

// Staff sign in as themselves, work in one shop, and can do only what their
// role allows; the owner's settings stay the owner's; entries say who
// recorded them; and taking someone off the staff locks them out at once.
func TestStaffWorkWithinTheirRole(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Pema")

	invite := func(name, email, role string) string {
		t.Helper()
		r := owner.post("/api/staff/invitations", map[string]any{"name": name, "email_address": email, "role": role})
		equal(t, r.Status, 200, "invited "+name)
		return r.str("join_path")
	}
	equal(t, owner.post("/api/staff/invitations", map[string]any{"name": "X", "email_address": "karma@shop.bt", "role": "cashier"}).Status, 422, "not an email that already has a login")
	equal(t, owner.post("/api/staff/invitations", map[string]any{"name": "X", "email_address": "x@shop.bt", "role": "boss"}).Status, 422, "known roles only")

	manager, cashier, viewer := a.browser(), a.browser(), a.browser()
	managerLink := invite("Sonam", "sonam@shop.bt", "manager")
	equal(t, manager.get("/api/staff_invitations/"+strings.TrimPrefix(managerLink, "/staff/join/")).str("shop_name"), "Karma's Shop", "the invitation names the shop")
	equal(t, manager.joinStaff(managerLink, "Sonam").Status, 200, "manager joined")
	equal(t, a.browser().joinStaff(managerLink, "Someone").Status, 422, "a link works once")
	equal(t, cashier.joinStaff(invite("Dawa", "dawa@shop.bt", "cashier"), "Dawa").Status, 200, "cashier joined")
	equal(t, viewer.joinStaff(invite("Tashi", "tashi@shop.bt", "viewer"), "Tashi").Status, 200, "viewer joined")

	me := cashier.get("/api/me")
	equal(t, me.str("user.role"), "staff", "a staff login")
	equal(t, me.str("shop.name"), "Karma's Shop", "in the owner's shop")
	equal(t, me.str("shop_role"), "cashier", "as a cashier")

	// Recording: cashier yes, viewer no. The entry is the cashier's.
	credit := cashier.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "300"})
	equal(t, credit.Status, 200, "the cashier records a credit")
	entry := credit.num("transaction_id")
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d", account)).str("ledger.0.created_by_name"), "Dawa", "under the cashier's name")
	equal(t, viewer.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "1"}).Status, 403, "the viewer cannot record")
	equal(t, viewer.get(fmt.Sprintf("/api/accounts/%d", account)).Status, 200, "but can read")
	equal(t, viewer.get(fmt.Sprintf("/api/accounts/%d/statement", account)).Status, 200, "and print a statement")
	equal(t, viewer.get("/api/dashboard").num("total_outstanding_cents"), int64(30_000), "and see the dashboard")

	// Changing the book: manager yes, cashier no.
	equal(t, cashier.patch(fmt.Sprintf("/api/transactions/%d", entry), map[string]any{"amount": "1"}).Status, 403, "the cashier cannot change an entry")
	equal(t, cashier.post(fmt.Sprintf("/api/transactions/%d/cross_out", entry), nil).Status, 403, "nor cross one out")
	equal(t, manager.patch(fmt.Sprintf("/api/transactions/%d", entry), map[string]any{"amount": "250"}).Status, 200, "the manager can")
	status, _, _ := viewer.raw(fmt.Sprintf("/api/transactions/%d/receipt.pdf", entry))
	equal(t, status, 404, "credits have no receipt, for staff either")

	// The owner's alone, whatever the role.
	for _, req := range []struct{ method, path string }{
		{"GET", "/api/subscription"}, {"POST", "/api/bank_accounts"}, {"PATCH", "/api/shop/profile"}, {"GET", "/api/staff"},
		{"POST", "/api/staff/invitations"}, {"PATCH", "/api/shop/reminders"}, {"DELETE", fmt.Sprintf("/api/accounts/%d", account)},
	} {
		equal(t, manager.request(req.method, req.path, map[string]any{}).Status, 403, "the manager is refused "+req.method+" "+req.path)
	}

	// Another shop's book is out of reach.
	other := a.browser()
	other.openShop("Dorji", "dorji@shop.bt")
	elsewhere := other.addCustomer("Kinley")
	equal(t, manager.get(fmt.Sprintf("/api/accounts/%d", elsewhere)).Status, 403, "not another shop's customer")
	equal(t, manager.post(fmt.Sprintf("/api/accounts/%d/credits", elsewhere), map[string]any{"amount": "1"}).Status, 404, "nor its book")

	// The owner changes a role, then takes someone off the staff.
	members := owner.get("/api/staff")
	equal(t, members.len("members"), 3, "three staff")
	var cashierID int64
	for i := 0; i < members.len("members"); i++ {
		if members.str(fmt.Sprintf("members.%d.role", i)) == "cashier" {
			cashierID = members.num(fmt.Sprintf("members.%d.id", i))
		}
	}
	equal(t, owner.patch(fmt.Sprintf("/api/staff/%d", cashierID), map[string]any{"role": "viewer"}).Status, 200, "now read only")
	equal(t, cashier.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "1"}).Status, 403, "and cannot record any more")
	equal(t, owner.delete(fmt.Sprintf("/api/staff/%d", cashierID)).Status, 200, "removed")
	equal(t, cashier.get("/api/me").Status, 401, "signed out everywhere")
	equal(t, a.browser().post("/api/session", map[string]any{"email_address": "dawa@shop.bt", "password": "password123"}).Status, 200, "can still sign in")
	again := a.browser()
	again.post("/api/session", map[string]any{"email_address": "dawa@shop.bt", "password": "password123"})
	equal(t, again.get("/api/accounts").Status, 403, "but reaches nothing of the shop")
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d", account)).str("ledger.0.created_by_name"), "Dawa", "their entries keep their name")
	equal(t, other.delete(fmt.Sprintf("/api/staff/%d", cashierID)).Status, 404, "another shop cannot touch the staff")
}

// Staff accounts are a Business feature after the trial; a shop that moves
// down keeps its staff rows, but they cannot reach the shop until it moves
// back. Places on the plan are counted, invitations included.
func TestStaffNeedTheBusinessPlan(t *testing.T) {
	a := newApp(t)
	ctx := context.Background()
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	for i := 0; i < 5; i++ {
		equal(t, owner.post("/api/staff/invitations", map[string]any{"name": "S", "email_address": fmt.Sprintf("s%d@shop.bt", i), "role": "viewer"}).Status, 200, "a place")
	}
	equal(t, owner.post("/api/staff/invitations", map[string]any{"name": "S", "email_address": "s9@shop.bt", "role": "viewer"}).Status, 422, "five places, invitations count")
	first := owner.get("/api/staff").str("invitations.0.join_path")
	staff := a.browser()
	equal(t, staff.joinStaff(first, "S").Status, 200, "joined")

	_, _ = a.DB.Exec(ctx, "UPDATE subscriptions SET status = 1, plan = 'pro', current_period_end = now() + interval '300 days'")
	equal(t, staff.get("/api/accounts").Status, 403, "Pro has no staff: locked out")
	equal(t, owner.post("/api/staff/invitations", map[string]any{"name": "S", "email_address": "s8@shop.bt", "role": "viewer"}).str("code"), "plan_required", "no invitations on Pro")
	_, _ = a.DB.Exec(ctx, "UPDATE subscriptions SET plan = 'business'")
	equal(t, staff.get("/api/accounts").Status, 200, "back on Business: back in")
}
