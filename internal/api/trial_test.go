package api_test

import (
	"context"
	"testing"
	"time"
)

func TestAFreeTrialLastsThreeMonthsAndTheOwnerIsToldBeforeItEnds(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")

	sub := owner.get("/api/me").get("subscription").(map[string]any)
	end, _ := time.Parse(time.RFC3339Nano, sub["current_period_end"].(string))
	want := time.Now().UTC().AddDate(0, 3, 0)
	equal(t, end.Sub(want).Abs() < time.Minute, true, "three months from opening")
	equal(t, sub["status_label"], any("Free trial"), "trialing")

	ctx := context.Background()
	remind := func() {
		if err := a.api.TrialEndingReminders(ctx); err != nil {
			t.Fatal(err)
		}
		a.api.Wait()
	}
	remind()
	equal(t, owner.get("/api/notifications").len("notifications"), 0, "nothing while there is time")

	// Three days left: the owner hears, once. (The test app's price is Nu. 300 a month.)
	_, _ = a.DB.Exec(ctx, "UPDATE subscriptions SET current_period_end = now() + interval '3 days' - interval '1 hour'")
	remind()
	notes := owner.get("/api/notifications")
	equal(t, notes.len("notifications"), 1, "told")
	equal(t, notes.str("notifications.0.title"), "Your free trial ends in 3 days", "what")
	equal(t, notes.str("notifications.0.body"), "Pay Nu. 3,600 for a year by bank transfer to keep recording credits and payments.", "how much")
	equal(t, notes.str("notifications.0.path"), "/subscription", "where to pay")

	// The next day it is two days left: no second note.
	_, _ = a.DB.Exec(ctx, "UPDATE subscriptions SET current_period_end = now() + interval '2 days' - interval '1 hour'")
	remind()
	equal(t, owner.get("/api/notifications").len("notifications"), 1, "told once")
}
