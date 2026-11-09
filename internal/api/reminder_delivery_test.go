package api_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"bangkee/internal/config"
	"bangkee/internal/notify"
	"bangkee/internal/store"
)

// With the WhatsApp Business API set up, a customer who has not joined is
// reminded on WhatsApp by Bangkee — once a day, with the approved template
// and their number in international form — and a refusal is written down.
func TestRemindersReachCustomersWhoHaveNotJoinedOnWhatsApp(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	long := time.Now().AddDate(0, 0, -45).Format(time.RFC3339)
	dorji := owner.addCustomerWithPhone("Dorji", "17 61 23 45")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/credits", dorji), map[string]any{"amount": "2450", "occurred_at": long}).Status, 200, "owes")

	// Not set up: skipped, as before.
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/remind", dorji), nil).str("outcome.status"), "skipped", "no WhatsApp: left to the owner")

	var sent []map[string]any
	refuse := false
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		equal(t, r.Header.Get("Authorization"), "Bearer token", "the access token")
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		sent = append(sent, body)
		if refuse {
			w.WriteHeader(400)
			_, _ = w.Write([]byte(`{"error":{"message":"Template name does not exist in the translation"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"messages":[{"id":"wamid.1"}]}`))
	}))
	defer meta.Close()
	whatsApp := notify.NewWhatsApp(&config.WhatsApp{AccessToken: "token", PhoneNumberID: "123", ReminderTemplate: "payment_reminder"})
	whatsApp.UseEndpoint(meta.URL)
	a.api.WhatsApp = whatsApp

	// The skip above was today's try; a fresh customer shows the send.
	pema := owner.addCustomerWithPhone("Pema", "+975 77 11 22 33")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/credits", pema), map[string]any{"amount": "500", "occurred_at": long}).Status, 200, "owes")
	r := owner.post(fmt.Sprintf("/api/accounts/%d/remind", pema), nil)
	equal(t, r.str("outcome.status"), "sent", "sent")
	equal(t, r.str("outcome.channel"), "bangkee_whatsapp", "on WhatsApp")
	equal(t, r.str("notice"), "Reminder sent to Pema on WhatsApp.", "the owner is told how")
	equal(t, len(sent), 1, "one message")
	equal(t, sent[0]["to"], "97577112233", "the number, internationally")
	template, _ := json.Marshal(sent[0]["template"])
	equal(t, strings.Contains(string(template), `"name":"payment_reminder"`), true, "the approved template")
	equal(t, strings.Contains(string(template), `{"text":"Pema","type":"text"},{"text":"Karma's Shop","type":"text"},{"text":"Nu. 500","type":"text"}`), true, "name, shop, amount: "+string(template))
	history := owner.get(fmt.Sprintf("/api/accounts/%d/reminders", pema))
	equal(t, history.str("reminders.0.channel"), "bangkee_whatsapp", "in the history")
	equal(t, history.str("reminders.0.detail"), "Accepted by WhatsApp", "as accepted, not delivered")

	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/remind", pema), nil).str("outcome.status"), "duplicate", "once a day")
	equal(t, len(sent), 1, "no second message")

	refuse = true
	tashi := owner.addCustomerWithPhone("Tashi", "17 99 88 77")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/credits", tashi), map[string]any{"amount": "500", "occurred_at": long}).Status, 200, "owes")
	r = owner.post(fmt.Sprintf("/api/accounts/%d/remind", tashi), nil)
	equal(t, r.str("outcome.status"), "failed", "refused")
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d/reminders", tashi)).str("reminders.0.detail"), "WhatsApp refused it: Template name does not exist in the translation", "with Meta's reason")
}

// A reminder's history says how its notification went out by push and email.
func TestReminderHistoryShowsHowItWentOut(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	pema := owner.addCustomer("Pema")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/credits", pema), map[string]any{"amount": "500"}).Status, 200, "owes")
	phone := a.browser()
	phone.join(owner.invitePath(pema), "Pema", "pema@example.bt")

	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/remind", pema), nil).str("outcome.status"), "sent", "reminded")
	a.api.Wait()
	history := owner.get(fmt.Sprintf("/api/accounts/%d/reminders", pema))
	equal(t, history.len("reminders.0.deliveries"), 0, "no push device and no mail server here: nothing to report")

	notificationID := phone.get("/api/notifications").num("notifications.0.id")
	q := store.New(a.DB)
	ctx := context.Background()
	equal(t, q.InsertNotificationDelivery(ctx, store.InsertNotificationDeliveryParams{NotificationID: notificationID, Channel: "push", Status: "sent", Detail: ptr("1 device")}), nil, "push")
	equal(t, q.InsertNotificationDelivery(ctx, store.InsertNotificationDeliveryParams{NotificationID: notificationID, Channel: "email", Status: "failed", Detail: ptr("The mail server did not accept it")}), nil, "email")
	history = owner.get(fmt.Sprintf("/api/accounts/%d/reminders", pema))
	equal(t, history.str("reminders.0.deliveries.0.channel"), "push", "push first")
	equal(t, history.str("reminders.0.deliveries.1.status"), "failed", "the email failed")
	equal(t, history.str("reminders.0.deliveries.1.detail"), "The mail server did not accept it", "and why")
}

// The shop's alerts reach its staff by role: a flagged entry goes to whoever
// can fix it, a new customer to whoever invites them, nothing to read-only staff.
func TestShopAlertsReachStaffByRole(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	invite := func(name, email, role string) *browser {
		t.Helper()
		r := owner.post("/api/staff/invitations", map[string]any{"name": name, "email_address": email, "role": role})
		equal(t, r.Status, 200, "invited "+name)
		b := a.browser()
		equal(t, b.joinStaff(r.str("join_path"), name).Status, 200, name+" joined")
		return b
	}
	manager, cashier, viewer := invite("Sonam", "sonam@shop.bt", "manager"), invite("Dawa", "dawa@shop.bt", "cashier"), invite("Tashi", "tashi@shop.bt", "viewer")

	pema := owner.addCustomer("Pema")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/credits", pema), map[string]any{"amount": "500"}).Status, 200, "credit")
	phone := a.browser()
	phone.join(owner.invitePath(pema), "Pema", "pema@example.bt")
	a.api.Wait()
	titles := func(b *browser) []string {
		var out []string
		for i := range b.get("/api/notifications").len("notifications") {
			out = append(out, b.get("/api/notifications").str(fmt.Sprintf("notifications.%d.title", i)))
		}
		return out
	}
	equal(t, fmt.Sprint(titles(cashier)), "[Pema joined]", "the cashier hears a customer joined")
	equal(t, fmt.Sprint(titles(manager)), "[Pema joined]", "so does the manager")

	entry := phone.get(fmt.Sprintf("/api/accounts/%d", pema)).num("ledger.0.id")
	equal(t, phone.post(fmt.Sprintf("/api/transactions/%d/dispute", entry), map[string]any{"reason": "Not mine"}).Status, 200, "flagged")
	a.api.Wait()
	equal(t, titles(manager)[0], "Pema flagged a credit of Nu. 500", "the manager hears of the flag")
	equal(t, titles(owner)[0], "Pema flagged a credit of Nu. 500", "and the owner")
	equal(t, len(titles(cashier)), 1, "the cashier cannot fix it, so is not told")
	equal(t, len(titles(viewer)), 0, "read-only staff hear nothing")
}

func ptr(s string) *string { return &s }
