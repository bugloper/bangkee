package api_test

// Customers joining, the shops catalog, items and their photos, a
// payment's photo, §17 billing, and the two hosts.

import (
	"context"

	"bangkee/internal/domain"
	"bangkee/internal/store"
	"fmt"
	"strings"
	"testing"
)

func TestACustomerNeedsAPhoneAndJoinsWithANameAndPIN(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")

	noPhone := owner.post("/api/accounts", map[string]any{"customer_name": "Pema"})
	equal(t, fmt.Sprint(noPhone.get("errors")), "[Phone can't be blank]", "phone required")
	account := owner.addCustomerWithPhone("Pema", "17 61 23 45")
	again := owner.post("/api/accounts", map[string]any{"customer_name": "Pema D", "customer_phone": "+975 1761 2345"})
	equal(t, fmt.Sprint(again.get("errors")), "[A customer with that phone is already in your book]", "one customer per phone")
	invite := owner.get(fmt.Sprintf("/api/accounts/%d/invite", account))
	equal(t, invite.str("phone"), "17 61 23 45", "the invite knows where to go")
	path := invite.str("invite_path")
	token := strings.TrimPrefix(path, "/join/")

	// New to Bangkee: their name and a PIN, nothing else.
	pema := a.browser()
	landing := pema.get("/api/invitations/" + token)
	equal(t, landing.str("next"), "join", "join")
	equal(t, landing.str("customer_name"), "Pema", "the shop's name for them")
	bad := pema.post("/api/invitations/"+token+"/join", map[string]any{"name": "Pema Choden", "pin": "12a4"})
	equal(t, fmt.Sprint(bad.get("errors")), "[PIN must be 4 digits]", "PIN shape")
	joined := pema.post("/api/invitations/"+token+"/join", map[string]any{"name": "Pema Choden", "pin": "4826"})
	equal(t, joined.Status, 200, "joined")
	equal(t, pema.get("/api/me").str("user.name"), "Pema Choden", "signed in")
	equal(t, pema.get(fmt.Sprintf("/api/accounts/%d", account)).Status, 200, "sees their account")

	// Later, on another phone: phone number and PIN.
	other := a.browser()
	wrong := other.post("/api/session", map[string]any{"phone": "17612345", "pin": "0000"})
	equal(t, wrong.str("error"), "Try another phone number or PIN.", "wrong PIN")
	equal(t, other.post("/api/session", map[string]any{"phone": "+975 17 61 23 45", "pin": "4826"}).Status, 200, "phone and PIN")

	// A second shop invites the same phone: they already have a login, so they sign in.
	second := a.browser()
	second.openShop("Dorji", "dorji@shop.bt")
	elsewhere := second.addCustomerWithPhone("Pema C", "17612345")
	token2 := strings.TrimPrefix(second.get(fmt.Sprintf("/api/accounts/%d/invite", elsewhere)).str("invite_path"), "/join/")
	fresh := a.browser()
	equal(t, fresh.get("/api/invitations/"+token2).str("next"), "sign_in", "existing login: sign in")
	refused := fresh.post("/api/invitations/"+token2+"/join", map[string]any{"name": "Someone", "pin": "1111"})
	equal(t, refused.str("error"), "You already have a Bangkee login. Sign in with your phone and PIN.", "no second login")
	fresh.post("/api/session", map[string]any{"phone": "17612345", "pin": "4826"})
	equal(t, fresh.get("/api/invitations/"+token2).str("outcome"), "claimed", "signed in, the link joins them")

	// Forgotten PIN: the shop sends a fresh link; the old one stops working.
	reset := owner.post(fmt.Sprintf("/api/accounts/%d/pin_reset", account), map[string]any{})
	equal(t, reset.Status, 200, "reset link")
	newToken := strings.TrimPrefix(reset.str("invite_path"), "/join/")
	equal(t, newToken != token, true, "a fresh link")
	equal(t, a.browser().get("/api/invitations/"+token).str("outcome"), "refused", "old link dead")
	forgot := a.browser()
	equal(t, forgot.get("/api/invitations/"+newToken).str("next"), "new_pin", "new PIN")
	equal(t, forgot.post("/api/invitations/"+newToken+"/pin", map[string]any{"pin": "7391"}).Status, 200, "PIN set")
	equal(t, pema.get("/api/me").Status, 401, "old sign-ins ended")
	equal(t, a.browser().post("/api/session", map[string]any{"phone": "17612345", "pin": "7391"}).Status, 200, "new PIN works")
	equal(t, a.browser().get("/api/invitations/"+newToken).str("next"), "sign_in", "the reset is used up")
}

func TestACustomerBrowsesShopsAndTheirItems(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	equal(t, owner.patch("/api/shop/profile", map[string]any{"name": "Karma's Shop", "kind": "spaceship"}).Status, 422, "unknown type")
	equal(t, owner.patch("/api/shop/profile", map[string]any{"name": "", "kind": "restaurant"}).Status, 422, "a name is needed")
	owner.patch("/api/shop/profile", map[string]any{"name": "Karma's Shop", "kind": "restaurant", "location": "Paro Town", "phone": "08 271 234", "hours": "9 – 9"})
	equal(t, owner.get("/api/shop/profile").str("shop.location"), "Paro Town", "profile saved")
	owner.post("/api/menu_items", map[string]any{"name": "Momo", "category": "Food", "price": "80", "available": true})
	owner.post("/api/menu_items", map[string]any{"name": "Thukpa", "price": "100", "available": false})
	// A shop with nothing to show is not listed.
	a.browser().openShop("Empty", "empty@shop.bt")

	dawa := a.browser()
	dawa.join(owner.invitePath(owner.addCustomer("Dawa")), "Dawa Tashi", "dawa@example.bt")

	shops := dawa.get("/api/shops")
	equal(t, shops.len("shops"), 1, "only shops with items")
	equal(t, shops.str("shops.0.name"), "Karma's Shop", "listed")
	equal(t, shops.str("shops.0.kind_label"), "Restaurant", "type")
	equal(t, shops.num("shops.0.items_count"), 2, "items counted")
	equal(t, shops.str("shops.0.location"), "Paro Town", "where it is")
	equal(t, dawa.get("/api/shops?kind=grocery").len("shops"), 0, "filtered by type")
	equal(t, dawa.get("/api/shops?q=karma").len("shops"), 1, "searched by name")

	page := dawa.get(fmt.Sprintf("/api/shops/%d", shops.num("shops.0.id")))
	equal(t, page.str("menu.0.category"), "Food", "grouped")
	equal(t, page.str("menu.0.items.0.name"), "Momo", "available items")
	equal(t, page.num("menu.0.items.0.price_cents"), 8_000, "with prices")
	equal(t, page.str("shop.hours"), "9 – 9", "the profile")
	equal(t, page.str("menu.1.items.0.name"), "Thukpa", "out of stock still listed")
	equal(t, page.get("menu.1.items.0.available"), any(false), "marked out of stock")
	equal(t, page.get("mine"), any(false), "not the owner")
	equal(t, a.browser().get("/api/shops").Status, 401, "signed in only")
}

func TestAnItemCanHaveAPhotoEveryoneCanSee(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	created := owner.post("/api/menu_items", map[string]any{"name": "Momo", "price": "80", "available": true})
	item := created.num("id")
	equal(t, owner.get(fmt.Sprintf("/api/menu_items/%d", item)).get("image_url"), any(nil), "no photo yet: optional")

	path := fmt.Sprintf("/api/menu_items/%d/image", item)
	missing := owner.multipart(path, nil, "", nil)
	equal(t, fmt.Sprint(missing.get("errors")), "[Photo must be attached]", "nothing sent")
	equal(t, owner.multipart(path, nil, "image", screenshot(t)).str("notice"), "Photo saved.", "saved")
	url := owner.get("/api/menu_items").str("items.0.image_url")
	equal(t, strings.HasPrefix(url, "/api/public/item_images/"), true, "listed with its photo")
	equal(t, a.storedFiles(), 1, "one file")

	// A customer sees it on the shop's page; the file itself needs no sign-in.
	customer := a.browser()
	customer.join(owner.invitePath(owner.addCustomer("Pema")), "Pema", "pema@example.bt")
	shop := customer.get("/api/shops").num("shops.0.id")
	equal(t, customer.get(fmt.Sprintf("/api/shops/%d", shop)).str("menu.0.items.0.image_url"), url, "on the shop's page")
	anyone := a.browser()
	equal(t, anyone.get(url).Status, 200, "served without signing in")

	// A new photo replaces the old, file and all.
	owner.multipart(path, nil, "image", screenshot(t))
	newURL := owner.get("/api/menu_items").str("items.0.image_url")
	equal(t, newURL != url, true, "a new address")
	equal(t, anyone.get(url).Status, 404, "the old one is gone")
	equal(t, a.storedFiles(), 1, "still one file")

	// Only item photos are public: a payment's photo is not served this way.
	account := owner.addCustomer("Tashi")
	owner.multipart(fmt.Sprintf("/api/accounts/%d/payments", account), map[string]string{"amount": "10"}, "screenshot", screenshot(t))
	shotURL := owner.get(fmt.Sprintf("/api/accounts/%d", account)).str("ledger.0.screenshot_url")
	shotID := shotURL[strings.LastIndex(shotURL, "/")+1:]
	equal(t, anyone.get("/api/public/item_images/"+shotID).Status, 404, "a payment photo is not an item photo")

	equal(t, owner.delete(path).str("notice"), "Photo removed.", "removed")
	equal(t, owner.get("/api/menu_items").get("items.0.image_url"), any(nil), "no photo")
	equal(t, a.storedFiles(), 1, "only the payment photo left")
	owner.multipart(path, nil, "image", screenshot(t))
	owner.delete(fmt.Sprintf("/api/menu_items/%d", item))
	equal(t, a.storedFiles(), 1, "removing the item removes its photo")
}

func TestAPaymentCanCarryAPhotoOfThePaymentScreen(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Pema")
	owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "1000"})
	customer := a.browser()
	customer.join(owner.invitePath(account), "Pema Choden", "pema@example.bt")
	payments := fmt.Sprintf("/api/accounts/%d/payments", account)

	// Without a photo it is the plain JSON it always was.
	equal(t, owner.post(payments, map[string]any{"amount": "100", "payment_method": "Cash"}).Status, 200, "cash, no photo")
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d", account)).get("ledger.0.screenshot_url"), any(nil), "no photo")

	// A payment that does not hold up keeps no photo either.
	bad := owner.multipart(payments, map[string]string{"amount": "0"}, "screenshot", screenshot(t))
	equal(t, bad.Status, 422, "refused")
	equal(t, owner.balance(account), 90_000, "nothing recorded")
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d", account)).len("ledger"), 2, "no entry")

	paid := owner.multipart(payments, map[string]string{"amount": "500", "payment_method": "Mobile transfer", "notes": "mBoB"}, "screenshot", screenshot(t))
	equal(t, paid.str("notice"), "Payment of Nu. 500 recorded.", "recorded")
	equal(t, owner.balance(account), 40_000, "balance")
	entry := owner.get(fmt.Sprintf("/api/accounts/%d", account))
	equal(t, entry.str("ledger.0.payment_method"), "Mobile transfer", "method")
	url := entry.str("ledger.0.screenshot_url")

	// The shop and the customer see it; nobody else does.
	equal(t, owner.get(url).Status, 200, "owner sees the photo")
	equal(t, customer.get(fmt.Sprintf("/api/accounts/%d", account)).str("ledger.0.screenshot_url"), url, "on the customer's book")
	equal(t, customer.get(url).Status, 200, "customer sees the photo")
	stranger := a.browser()
	stranger.openShop("Other", "other@shop.bt")
	equal(t, stranger.get(url).Status, 404, "stranger does not")

	// A replay of the same payment from the offline queue adds nothing.
	key := map[string]string{"amount": "50", "idempotency_key": "replay-1"}
	owner.multipart(payments, key, "screenshot", screenshot(t))
	again := owner.multipart(payments, key, "screenshot", screenshot(t))
	equal(t, again.str("notice"), "That payment was already recorded.", "replayed")
	equal(t, a.storedFiles(), 2, "one photo per payment")
}

func TestAnExhaustedGracePeriodLocksWritesButNotReads(t *testing.T) {
	a := newApp(t)
	ctx := context.Background()
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Tashi")
	_, err := a.DB.Exec(ctx, "UPDATE subscriptions SET current_period_end = now() - interval '40 days', grace_until = now() - interval '26 days'")
	if err != nil {
		t.Fatal(err)
	}

	locked := owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "100"})
	equal(t, locked.Status, 403, "locked")
	equal(t, locked.str("code"), "write_locked", "code")
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d", account)).Status, 200, "reads still work")

	// Billing is never blocked, and the cached status is corrected.
	equal(t, owner.get("/api/subscription").str("subscription.status"), "disabled", "billing")
	var status int32
	_ = a.DB.QueryRow(ctx, "SELECT status FROM subscriptions").Scan(&status)
	equal(t, status, 3, "cached status")

	submitted := owner.multipart("/api/subscription/payments",
		map[string]string{"amount": "200", "months": "2", "method": "Bank transfer"}, "screenshot", screenshot(t))
	equal(t, submitted.str("notice"), "Payment sent to Bangkee for approval.", "submitted")

	// The operator approves, on the console: cover runs from today (BR-43)
	// and the lock lifts.
	a.browser().openShop("Operator", "admin@bangkee.bt")
	_, _ = a.DB.Exec(ctx, "UPDATE users SET platform_admin = true WHERE email_address = 'admin@bangkee.bt'")
	operator := a.console()
	equal(t, operator.signIn("admin@bangkee.bt").Status, 200, "operator signs in on the console")
	queue := operator.get("/api/admin/subscription_payments")
	equal(t, queue.num("pending_count"), 1, "queue")
	approved := operator.post(fmt.Sprintf("/api/admin/subscription_payments/%d/approve", queue.num("payments.0.id")), map[string]any{})
	if !strings.HasPrefix(approved.str("notice"), "Approved. Karma's Shop is paid through ") {
		t.Errorf("approved: %v", approved.Body)
	}
	equal(t, owner.get("/api/me").str("subscription.status"), "active", "active again")
	equal(t, owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "100"}).Status, 200, "writes again")

}

func TestEachHostServesOnlyItsOwnPeople(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	// The operator as the seed makes them: staff, with no shop of their own.
	ctx := context.Background()
	staffUser, err := domain.CreateUser(ctx, store.New(a.DB), domain.NewUser{Name: "Operator", EmailAddress: "admin@bangkee.bt", Password: "password", Role: domain.RoleShopOwner})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = a.DB.Exec(ctx, "UPDATE users SET platform_admin = true WHERE id = $1", staffUser.ID)

	// The app host has no operator API, even for an operator.
	equal(t, owner.get("/api/admin/dashboard").Status, 404, "no admin API on the app host")
	staff := a.browser()
	equal(t, staff.signIn("admin@bangkee.bt").str("error"), "Bangkee staff sign in at admin.bangkee.test.", "staff sent to the console")
	// In development the app runs on a port; the console's address keeps it.
	equal(t, a.on("localhost:5173").signIn("admin@bangkee.bt").str("error"), "Bangkee staff sign in at admin.localhost:5173.", "with the port")

	// The console signs in staff only, and serves nothing of the app.
	console := a.console()
	equal(t, console.signIn("karma@shop.bt").str("error"), "That area is for Bangkee staff.", "owner refused on the console")
	equal(t, console.signIn("admin@bangkee.bt").Status, 200, "staff signs in")
	equal(t, console.get("/api/admin/dashboard").Status, 200, "operator dashboard")
	equal(t, console.get("/api/accounts").Status, 404, "no shop screens on the console")
	equal(t, console.post("/api/registration", map[string]any{"name": "x"}).Status, 404, "no sign-up on the console")

	// A payment waiting for review reaches the operator, pointing into the console.
	owner.multipart("/api/subscription/payments", map[string]string{"amount": "3600"}, "screenshot", screenshot(t))
	equal(t, console.get("/api/me").num("unread_notifications"), 1, "operator was told")
	equal(t, console.get("/api/notifications").str("notifications.0.path"), "/subscription_payments", "console path")
	equal(t, console.get("/api/me").num("badges.admin_payments"), 1, "queue badge")
}

func TestOnePlanBilledAnnually(t *testing.T) {
	a := newApp(t)
	pricing := a.browser().get("/api/public/pricing")
	equal(t, pricing.num("monthly_price_cents"), 30_000, "monthly")
	equal(t, pricing.num("annual_price_cents"), 360_000, "annual")
	equal(t, pricing.num("trial_days"), 14, "trial")

	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	billing := owner.get("/api/subscription")
	equal(t, billing.num("subscription.price_cents"), 30_000, "new shops at the current price")
	equal(t, billing.num("operator.annual_price_cents"), 360_000, "annual on billing")
	if !strings.HasPrefix(billing.str("operator.instructions"), "Transfer Nu. 3,600 for a year of Bangkee (Nu. 300 a month, billed annually)") {
		t.Errorf("instructions: %q", billing.str("operator.instructions"))
	}

	// A payment buys a year unless it says otherwise.
	owner.multipart("/api/subscription/payments", map[string]string{"amount": "3600"}, "screenshot", screenshot(t))
	equal(t, owner.get("/api/subscription").num("payments.0.months"), 12, "a year")
}

func TestFeedbackReachesTheOperatorWhoAcknowledgesAndReplies(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	customer := a.browser()
	customer.join(owner.invitePath(owner.addCustomer("Pema")), "Pema", "pema@example.bt")

	ctx := context.Background()
	staffUser, err := domain.CreateUser(ctx, store.New(a.DB), domain.NewUser{Name: "Operator", EmailAddress: "admin@bangkee.bt", Password: "password", Role: domain.RoleShopOwner})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = a.DB.Exec(ctx, "UPDATE users SET platform_admin = true WHERE id = $1", staffUser.ID)
	operator := a.console()
	operator.signIn("admin@bangkee.bt")

	// Anyone signed in can write; what they write must be something.
	equal(t, owner.get("/api/feedback").len("kinds"), 3, "feedback, feature, support")
	equal(t, fmt.Sprint(owner.post("/api/feedback", map[string]any{"kind": "praise", "body": " "}).get("errors")),
		"[Choose feedback, a feature request or support Message can't be blank]", "checked")
	sent := owner.post("/api/feedback", map[string]any{"kind": "feature", "body": "  Let me export the book to Excel.  "})
	equal(t, sent.str("notice"), "Sent. Thank you — Bangkee will get back to you here.", "sent")
	customer.post("/api/feedback", map[string]any{"kind": "support", "body": "I forgot which shop I joined."})
	equal(t, a.browser().post("/api/feedback", map[string]any{"kind": "support", "body": "hi"}).Status, 401, "signed in only")

	// The operator is told, and sees who wrote.
	equal(t, operator.get("/api/me").num("badges.admin_feedback"), 2, "badge")
	equal(t, operator.get("/api/notifications").str("notifications.0.path"), "/feedback", "console path")
	queue := operator.get("/api/admin/feedback")
	equal(t, queue.num("new_count"), 2, "two new")
	equal(t, queue.str("messages.1.body"), "Let me export the book to Excel.", "trimmed, oldest last")
	equal(t, queue.str("messages.1.from.shop"), "Karma's Shop", "the owner's shop")
	equal(t, queue.str("messages.1.from.role"), "shop_owner", "an owner")
	equal(t, queue.str("messages.0.from.role"), "customer", "a customer")
	equal(t, queue.get("messages.0.from.shop"), any(nil), "customers have no shop")
	featureID := queue.num("messages.1.id")
	supportID := queue.num("messages.0.id")

	// Acknowledge, once.
	ack := operator.post(fmt.Sprintf("/api/admin/feedback/%d/acknowledge", featureID), map[string]any{})
	equal(t, ack.str("notice"), "Acknowledged. They have been told it was seen.", "acknowledged")
	equal(t, operator.post(fmt.Sprintf("/api/admin/feedback/%d/acknowledge", featureID), map[string]any{}).str("error"), "That message was already acknowledged.", "twice")
	mine := owner.get("/api/feedback")
	equal(t, mine.str("messages.0.status"), "acknowledged", "the owner sees it was seen")
	equal(t, owner.get("/api/notifications").str("notifications.0.title"), "Bangkee has seen your feature request", "owner told")

	// Reply, once; a reply needs words.
	equal(t, operator.post(fmt.Sprintf("/api/admin/feedback/%d/reply", supportID), map[string]any{"reply": ""}).Status, 422, "blank reply")
	operator.post(fmt.Sprintf("/api/admin/feedback/%d/reply", supportID), map[string]any{"reply": "You joined Karma's Shop — it is on your Home screen."})
	equal(t, operator.post(fmt.Sprintf("/api/admin/feedback/%d/reply", supportID), map[string]any{"reply": "Again"}).str("error"), "That message already has a reply.", "one reply")
	answered := customer.get("/api/feedback")
	equal(t, answered.str("messages.0.status"), "replied", "replied")
	equal(t, answered.str("messages.0.reply"), "You joined Karma's Shop — it is on your Home screen.", "the customer reads the reply")
	equal(t, customer.get("/api/notifications").str("notifications.0.path"), "/help", "to their Help page")
	equal(t, operator.get("/api/admin/feedback?status=replied").len("messages"), 1, "filtered by status")
	equal(t, operator.get("/api/me").num("badges.admin_feedback"), 0, "nothing new left")

	// Only the operator reviews, and each person sees only their own.
	equal(t, owner.get("/api/admin/feedback").Status, 404, "not on the app host")
	equal(t, owner.get("/api/feedback").len("messages"), 1, "only their own")
}
