package api_test

import (
	"context"
	"fmt"
	"testing"
)

// The console's overview counts shops by where they stand — trial, each
// plan, locked — and its money by the month it was approved; the shop list
// carries each shop's plan and customers.
func TestTheConsoleOverviewCountsShopsAndMoney(t *testing.T) {
	a := newApp(t)
	ctx := context.Background()
	a.browser().openShop("Operator", "admin@bangkee.bt")
	_, _ = a.DB.Exec(ctx, "UPDATE users SET platform_admin = true WHERE email_address = 'admin@bangkee.bt'")
	console := a.console()
	equal(t, console.signIn("admin@bangkee.bt").Status, 200, "operator")

	owners := []string{"Karma", "Dorji", "Sonam"}
	for _, name := range owners {
		b := a.browser()
		b.openShop(name, name+"@shop.bt")
		b.addCustomer("Pema")
	}
	// Dorji pays for Pro; Sonam's cover ran out long ago.
	_, _ = a.DB.Exec(ctx, "UPDATE subscriptions SET status = 1, plan = 'pro', current_period_end = now() + interval '300 days' WHERE shop_id = (SELECT id FROM shops WHERE name = 'Dorji''s Shop')")
	_, _ = a.DB.Exec(ctx, "UPDATE subscriptions SET status = 1, current_period_end = now() - interval '60 days', grace_until = now() - interval '40 days' WHERE shop_id = (SELECT id FROM shops WHERE name = 'Sonam''s Shop')")
	dorji := a.browser()
	dorji.signIn("Dorji@shop.bt")
	equal(t, dorji.multipart("/api/subscription/payments", map[string]string{"amount": "2400", "plan": "pro"}, "screenshot", screenshot(t)).Status, 200, "paid")
	var id int64
	_ = a.DB.QueryRow(ctx, "SELECT id FROM subscription_payments ORDER BY id DESC LIMIT 1").Scan(&id)
	equal(t, console.post(fmt.Sprintf("/api/admin/subscription_payments/%d/approve", id), nil).Status, 200, "approved")

	// Some activity: Karma records two entries today.
	karma := a.browser()
	karma.signIn("Karma@shop.bt")
	pema := karma.get("/api/accounts").num("accounts.0.id")
	karma.post(fmt.Sprintf("/api/accounts/%d/credits", pema), map[string]any{"amount": "100"})
	karma.post(fmt.Sprintf("/api/accounts/%d/payments", pema), map[string]any{"amount": "50"})

	d := console.get("/api/admin/dashboard?days=7")
	equal(t, d.num("days"), int64(7), "the period asked for")
	equal(t, d.num("shops_count"), int64(4), "four shops, the operator's own included")
	equal(t, d.num("plan_mix.trialing"), int64(2), "two on trial")
	equal(t, d.num("plan_mix.pro"), int64(1), "one on Pro")
	equal(t, d.num("plan_mix.disabled"), int64(1), "one locked")
	equal(t, d.num("mrr_cents"), int64(30_000), "MRR: what the one paying shop pays a month (its own price)")
	equal(t, d.num("mrr_by_plan.pro"), int64(30_000), "all of it from Pro")
	equal(t, d.num("approved.value"), int64(240_000), "approved this week")
	equal(t, d.num("approved.previous"), int64(0), "nothing the week before")
	equal(t, d.len("approved.series"), 7, "a value a day")
	equal(t, d.num("new_shops.value"), int64(4), "new shops this week")
	equal(t, d.num("active_shops.value"), int64(1), "one shop recorded something")
	equal(t, d.num("entries.value"), int64(2), "two entries")
	equal(t, d.num("activity_days.6.credits"), int64(1), "today's credit")
	equal(t, d.num("activity_days.6.payments"), int64(1), "today's payment")
	equal(t, d.str("most_active.0.name"), "Karma's Shop", "the most active shop")
	equal(t, d.get("most_active.0.amount_cents"), nil, "and never how much its customers owe")
	equal(t, d.len("trials_ending"), 0, "no trial ends within two weeks")
	equal(t, console.get("/api/admin/dashboard?days=999").num("days"), int64(30), "unknown periods fall back to 30 days")

	shops := console.get("/api/admin/shops")
	equal(t, shops.len("shops"), 4, "every shop")
	for i := 0; i < 4; i++ {
		if shops.str(fmt.Sprintf("shops.%d.name", i)) == "Dorji's Shop" {
			equal(t, shops.str(fmt.Sprintf("shops.%d.subscription.plan", i)), "pro", "its plan")
			equal(t, shops.num(fmt.Sprintf("shops.%d.customers", i)), int64(1), "its customers")
		}
	}
	equal(t, a.browser().get("/api/admin/dashboard").Status, 404, "not on the app's host")
}
