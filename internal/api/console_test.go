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

	d := console.get("/api/admin/dashboard")
	equal(t, d.num("shops_count"), int64(4), "four shops, the operator's own included")
	equal(t, d.num("plan_mix.trialing"), int64(2), "two on trial")
	equal(t, d.num("plan_mix.pro"), int64(1), "one on Pro")
	equal(t, d.num("plan_mix.disabled"), int64(1), "one locked")
	equal(t, d.num("approved_month_cents"), int64(240_000), "approved this month")
	equal(t, d.len("months"), 12, "a year of months")
	equal(t, d.num("months.11.approved_cents"), int64(240_000), "this month is the last")
	equal(t, d.num("months.11.new_shops"), int64(4), "new shops this month")

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
