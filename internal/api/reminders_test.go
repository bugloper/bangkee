package api_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"bangkee/internal/domain"
)

// Automatic reminders go to overdue customers at the shop's hour and pace,
// never twice a day, never to someone who owes nothing, opted out, is paused
// or has a flagged entry — and each skip is written down for the owner.
func TestRemindersReachOnlyThoseTheyShould(t *testing.T) {
	a := newApp(t)
	ctx := context.Background()
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	long := time.Now().AddDate(0, 0, -45).Format(time.RFC3339)
	customer := func(name string, join bool) (int64, *browser) {
		t.Helper()
		id := owner.addCustomer(name)
		r := owner.post(fmt.Sprintf("/api/accounts/%d/credits", id), map[string]any{"amount": "500", "occurred_at": long})
		equal(t, r.Status, 200, "owes")
		if !join {
			return id, nil
		}
		b := a.browser()
		b.join(owner.invitePath(id), name, name+"@example.bt")
		return id, b
	}
	pema, pemaPhone := customer("pema", true)
	dorji, _ := customer("dorji", false)
	sonam, sonamPhone := customer("sonam", true)
	tashi, tashiPhone := customer("tashi", true)
	kinley, _ := customer("kinley", true)
	nima, _ := customer("nima", true)

	equal(t, sonamPhone.patch("/api/me/reminders", map[string]any{"opt_out": true}).Status, 200, "sonam turns reminders off")
	disputed := tashiPhone.get(fmt.Sprintf("/api/accounts/%d", tashi)).num("ledger.0.id")
	equal(t, tashiPhone.post(fmt.Sprintf("/api/transactions/%d/dispute", disputed), map[string]any{"reason": "Not mine"}).Status, 200, "tashi flags")
	equal(t, owner.patch(fmt.Sprintf("/api/accounts/%d/reminders", kinley), map[string]any{"paused": true}).Status, 200, "kinley paused")
	owner.post(fmt.Sprintf("/api/accounts/%d/payments", nima), map[string]any{"amount": "500"}) // settled

	// The shop reminds at 9 in Thimphu by default; 8 is not its hour.
	day := time.Now().In(domain.Thimphu)
	at := func(daysLater, hour int) time.Time {
		return time.Date(day.Year(), day.Month(), day.Day()+daysLater, hour, 5, 0, 0, domain.Thimphu)
	}
	a.api.RunReminders(ctx, at(0, 8))
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d/reminders", pema)).len("reminders"), 0, "not the shop's hour")

	a.api.RunReminders(ctx, at(0, 9))
	a.api.Wait()
	history := func(id int64) response { return owner.get(fmt.Sprintf("/api/accounts/%d/reminders", id)) }
	equal(t, history(pema).str("reminders.0.status"), "sent", "pema reminded")
	equal(t, pemaPhone.get("/api/notifications").str("notifications.0.title"), "A reminder from Karma's Shop", "pema was told")
	equal(t, history(dorji).str("reminders.0.detail"), "Has not joined Bangkee — remind them by WhatsApp or SMS", "not joined")
	equal(t, history(sonam).str("reminders.0.detail"), "They turned reminders off", "opted out")
	equal(t, history(tashi).str("reminders.0.detail"), "They have flagged an entry — settle it first", "disputed")
	equal(t, history(kinley).str("reminders.0.detail"), "Reminders are paused for this customer", "paused")
	equal(t, history(nima).len("reminders"), 0, "owes nothing: not even considered")
	equal(t, owner.get("/api/notifications").str("notifications.0.title"), "Reminded 1 overdue customer", "one note to the owner")

	// The pace: the same hour again, and the next day, change nothing; a week on, pema is reminded again.
	a.api.RunReminders(ctx, at(0, 9))
	a.api.RunReminders(ctx, at(1, 9))
	equal(t, history(pema).len("reminders"), 1, "every 7 days, not every run")
	a.api.RunReminders(ctx, at(7, 9))
	equal(t, history(pema).len("reminders"), 2, "a week later")

	// By hand: once a day through Bangkee, however many taps.
	fresh, _ := customer("dawa", true)
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/remind", fresh), nil).str("outcome.status"), "sent", "reminded by hand")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/remind", fresh), nil).str("outcome.status"), "duplicate", "not twice a day")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/reminders/log", dorji), map[string]any{"channel": "whatsapp"}).Status, 200, "a WhatsApp reminder is noted")
	equal(t, history(dorji).str("reminders.0.channel"), "whatsapp", "in the history")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/reminders/log", dorji), map[string]any{"channel": "pigeon"}).Status, 422, "known channels only")

	// Everyone overdue at once.
	bulk := owner.post("/api/reminders/overdue", map[string]any{})
	equal(t, bulk.Status, 200, "bulk")
	equal(t, bulk.num("sent"), int64(0), "pema and dawa were reminded today already; the rest are skipped, each with its reason")
	equal(t, bulk.len("outcomes"), 6, "every overdue account is accounted for")

	// Another shop cannot touch these.
	other := a.browser()
	other.openShop("Dorji", "dorji@shop.bt")
	equal(t, other.post(fmt.Sprintf("/api/accounts/%d/remind", pema), nil).Status, 404, "not another shop's customer")
	equal(t, other.get(fmt.Sprintf("/api/accounts/%d/reminders", pema)).Status, 404, "nor its history")

	// Settings are checked.
	equal(t, owner.patch("/api/shop/reminders", map[string]any{"enabled": true, "every_days": 5, "hour": 9}).Status, 422, "unknown pace")
	equal(t, owner.patch("/api/shop/reminders", map[string]any{"enabled": true, "every_days": 3, "hour": 23}).Status, 422, "not at night")
	equal(t, owner.patch("/api/shop/reminders", map[string]any{"enabled": true, "every_days": 3, "hour": 18}).Status, 200, "saved")
	equal(t, owner.get("/api/shop/reminders").num("hour"), int64(18), "kept")
}

// After the trial, automatic and bulk reminders are on Pro and Business; a
// Basic shop can still remind one customer by hand.
func TestBasicShopsRemindByHand(t *testing.T) {
	a := newApp(t)
	ctx := context.Background()
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	pema := owner.addCustomer("Pema")
	owner.post(fmt.Sprintf("/api/accounts/%d/credits", pema), map[string]any{"amount": "500", "occurred_at": time.Now().AddDate(0, 0, -45).Format(time.RFC3339)})
	b := a.browser()
	b.join(owner.invitePath(pema), "Pema", "pema@example.bt")
	_, err := a.DB.Exec(ctx, "UPDATE subscriptions SET status = 1, plan = 'basic', current_period_end = now() + interval '300 days'")
	if err != nil {
		t.Fatal(err)
	}
	day := time.Now().In(domain.Thimphu)
	a.api.RunReminders(ctx, time.Date(day.Year(), day.Month(), day.Day(), 9, 5, 0, 0, domain.Thimphu))
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d/reminders", pema)).len("reminders"), 0, "no automatic reminders on Basic")
	refused := owner.post("/api/reminders/overdue", map[string]any{})
	equal(t, refused.Status, 403, "no bulk reminders on Basic")
	equal(t, refused.str("code"), "plan_required", "says a plan is needed")
	equal(t, owner.patch("/api/shop/reminders", map[string]any{"enabled": true, "every_days": 7, "hour": 9}).Status, 403, "cannot switch them on")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/remind", pema), nil).str("outcome.status"), "sent", "one by hand still works")

	_, _ = a.DB.Exec(ctx, "UPDATE subscriptions SET plan = 'pro'")
	equal(t, owner.post("/api/reminders/overdue", map[string]any{}).Status, 200, "Pro can")
}
