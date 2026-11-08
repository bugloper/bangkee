package api_test

import (
	"context"
	"fmt"
	"testing"

	"bangkee/internal/domain"
	"bangkee/internal/store"
)

func TestTestimonialsReachTheHomepageOnlyOnceApproved(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	owner.patch("/api/shop/profile", map[string]any{"name": "Karma's Shop", "kind": "grocery", "location": "Paro Town"})
	customer := a.browser()
	customer.join(owner.invitePath(owner.addCustomer("Lhaki")), "Lhaki Dolma", "lhaki@example.bt")

	ctx := context.Background()
	staff, err := domain.CreateUser(ctx, store.New(a.DB), domain.NewUser{Name: "Operator", EmailAddress: "admin@bangkee.bt", Password: "password", Role: domain.RoleShopOwner})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = a.DB.Exec(ctx, "UPDATE users SET platform_admin = true WHERE id = $1", staff.ID)
	operator := a.console()
	operator.signIn("admin@bangkee.bt")
	visitor := a.browser()

	// Writing one: something to say, not an essay, signed in.
	equal(t, owner.get("/api/testimonial").get("testimonial"), any(nil), "none yet")
	equal(t, fmt.Sprint(owner.request("PUT", "/api/testimonial", map[string]any{"body": "Great"}).get("errors")), "[Say a little more (at least 20 characters)]", "too short")
	equal(t, a.browser().request("PUT", "/api/testimonial", map[string]any{"body": "Twenty characters or more here"}).Status, 401, "signed in only")
	saved := owner.request("PUT", "/api/testimonial", map[string]any{"body": "  I stopped   flipping pages. My customers check their own balance now.  "})
	equal(t, saved.str("notice"), "Thank you! Bangkee will read it before it appears on the homepage.", "saved")
	equal(t, owner.get("/api/testimonial").str("testimonial.body"), "I stopped flipping pages. My customers check their own balance now.", "tidied")
	equal(t, owner.get("/api/testimonial").str("testimonial.status"), "pending", "waiting for review")
	customer.request("PUT", "/api/testimonial", map[string]any{"body": "I can see what I owe at the shop from my phone."})

	// Nothing public until the operator approves it.
	equal(t, visitor.get("/api/public/testimonials").len("testimonials"), 0, "nothing approved yet")
	equal(t, operator.get("/api/me").num("badges.admin_testimonials"), 2, "the console's badge")
	equal(t, operator.get("/api/notifications").str("notifications.0.path"), "/testimonials", "the operator was told")
	queue := operator.get("/api/admin/testimonials")
	equal(t, queue.len("testimonials"), 2, "both waiting")
	ownerID := owner.get("/api/testimonial").num("testimonial.id")
	equal(t, owner.post(fmt.Sprintf("/api/admin/testimonials/%d/approve", ownerID), nil).Status, 404, "not for anyone but staff")
	equal(t, operator.post(fmt.Sprintf("/api/admin/testimonials/%d/approve", ownerID), nil).str("notice"), "Approved — it is on the homepage.", "approved")

	public := visitor.get("/api/public/testimonials")
	equal(t, public.len("testimonials"), 1, "only the approved one")
	equal(t, public.str("testimonials.0.name"), "Karma", "who said it")
	equal(t, public.str("testimonials.0.role"), "Karma's Shop, Paro Town", "their shop and town")
	equal(t, public.get("testimonials.0.owner"), any(true), "an owner")

	customerID := customer.get("/api/testimonial").num("testimonial.id")
	operator.post(fmt.Sprintf("/api/admin/testimonials/%d/approve", customerID), nil)
	equal(t, visitor.get("/api/public/testimonials").str("testimonials.0.role"), "Customer", "a customer is a customer")

	// Rewriting sends it back for review; hiding and withdrawing take it down.
	customer.request("PUT", "/api/testimonial", map[string]any{"body": "Changed my mind about the wording of this one."})
	equal(t, visitor.get("/api/public/testimonials").len("testimonials"), 1, "a rewrite waits for review again")
	operator.post(fmt.Sprintf("/api/admin/testimonials/%d/hide", ownerID), nil)
	equal(t, visitor.get("/api/public/testimonials").len("testimonials"), 0, "hidden")
	equal(t, customer.delete("/api/testimonial").str("notice"), "Your testimonial is removed.", "withdrawn")
	equal(t, customer.get("/api/testimonial").get("testimonial"), any(nil), "gone")
}
