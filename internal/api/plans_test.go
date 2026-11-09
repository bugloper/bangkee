package api_test

import (
	"context"
	"fmt"
	"testing"
)

// A shop pays for a year of the plan it chooses; approving the payment moves
// it onto that plan, with that plan's features and price. Without a plan the
// payment renews the one it is on, at the price it already pays.
func TestPayingForAPlanMovesTheShopOntoIt(t *testing.T) {
	a := newApp(t)
	ctx := context.Background()
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	a.browser().openShop("Operator", "admin@bangkee.bt")
	_, _ = a.DB.Exec(ctx, "UPDATE users SET platform_admin = true WHERE email_address = 'admin@bangkee.bt'")
	console := a.browser()
	equal(t, console.signIn("admin@bangkee.bt").Status, 200, "operator")

	pricing := owner.get("/api/public/pricing")
	equal(t, pricing.len("plans"), 3, "three plans")
	equal(t, pricing.str("plans.1.key"), "pro", "Pro")
	equal(t, pricing.num("plans.1.annual_price_cents"), int64(238_800), "Pro: Nu 199 a month, billed for a year")
	equal(t, pricing.num("plans.2.annual_price_cents"), int64(358_800), "Business: Nu 299 a month, billed for a year")

	// End the trial on Basic: Pro features are refused.
	_, _ = a.DB.Exec(ctx, "UPDATE subscriptions SET status = 1, plan = 'basic', current_period_end = now() + interval '10 days' WHERE shop_id = (SELECT id FROM shops WHERE name = 'Karma''s Shop')")
	equal(t, owner.get("/api/me").len("subscription.features"), 0, "Basic has none of the extras")
	equal(t, owner.multipart("/api/subscription/payments", map[string]string{"amount": "3600", "plan": "gold"}, "screenshot", screenshot(t)).Status, 422, "unknown plan")

	paid := owner.multipart("/api/subscription/payments", map[string]string{"amount": "3600", "plan": "pro"}, "screenshot", screenshot(t))
	equal(t, paid.Status, 200, "paid for Pro")
	billing := owner.get("/api/subscription")
	equal(t, billing.str("payments.0.plan"), "pro", "the payment says which plan")
	equal(t, billing.str("subscription.plan"), "basic", "still Basic until approved")

	var id int64
	_ = a.DB.QueryRow(ctx, "SELECT id FROM subscription_payments ORDER BY id DESC LIMIT 1").Scan(&id)
	equal(t, console.post(fmt.Sprintf("/api/admin/subscription_payments/%d/approve", id), nil).Status, 200, "approved")
	me := owner.get("/api/me")
	equal(t, me.str("subscription.plan"), "pro", "now on Pro")
	equal(t, me.num("subscription.price_cents"), int64(19_900), "at Pro's price")
	equal(t, me.len("subscription.features"), 5, "Pro's features")

	// Renewing without naming a plan keeps Pro.
	owner.multipart("/api/subscription/payments", map[string]string{"amount": "3600"}, "screenshot", screenshot(t))
	equal(t, owner.get("/api/subscription").str("payments.0.plan"), "pro", "a renewal keeps the plan")
}
