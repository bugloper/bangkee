package api_test

import (
	"fmt"
	"testing"
)

func TestVisitorsBrowseShopsFromTheHomepage(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	owner.patch("/api/shop/profile", map[string]any{"name": "Karma's Shop", "kind": "grocery", "location": "Paro Town", "latitude": 27.43, "longitude": 89.41})
	owner.post("/api/menu_items", map[string]any{"name": "Rice 25 kg", "category": "Staples", "price": "620", "available": true})
	owner.multipart("/api/shop/photo", nil, "image", screenshot(t))
	a.browser().openShop("Empty", "empty@shop.bt") // nothing listed: not shown
	visitor := a.browser()

	// The list, signed out: only shops with something to show, searchable by name and type.
	list := visitor.get("/api/public/shops")
	equal(t, list.Status, 200, "open to visitors")
	equal(t, list.len("shops"), 1, "only shops with items")
	equal(t, list.str("shops.0.name"), "Karma's Shop", "listed")
	equal(t, list.str("shops.0.location"), "Paro Town", "where")
	equal(t, visitor.get("/api/public/shops?q=karma").len("shops"), 1, "by name")
	equal(t, visitor.get("/api/public/shops?kind=bar").len("shops"), 0, "by type")
	photo := list.str("shops.0.photo_url")
	equal(t, visitor.get(photo).Status, 200, "the shop's photo is public")

	// A shop's page, signed out: profile, pin and items, never "mine".
	page := visitor.get(fmt.Sprintf("/api/public/shops/%d", list.num("shops.0.id")))
	equal(t, page.str("menu.0.items.0.name"), "Rice 25 kg", "its items")
	equal(t, page.get("shop.latitude"), any(27.43), "its pin")
	equal(t, page.get("mine"), any(false), "a visitor owns nothing")
	equal(t, visitor.get(fmt.Sprintf("/api/public/shops/%d", list.num("shops.0.id")+1)).Status, 404, "an empty shop has no public page")

	// What stays private: people's photos, and the signed-in app's own lists.
	owner.multipart("/api/me/photo", nil, "image", screenshot(t))
	equal(t, visitor.get(owner.get("/api/me").str("user.photo_url")).Status, 401, "a person's photo is not public")
	equal(t, visitor.get("/api/shops").Status, 401, "the app's directory still needs sign-in")
}

// A customer always finds the shops whose book they are in, even before the
// shop lists any items; strangers and the public list still see only shops
// with items.
func TestACustomerSeesTheirOwnShopsBeforeItsItemsAreListed(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Nima", "nima@shop.bt")
	account := owner.addCustomer("Pema")
	pema := a.browser()
	pema.join(owner.invitePath(account), "Pema", "pema@example.bt")
	shopID := owner.get("/api/me").num("shop.id")

	list := pema.get("/api/shops")
	equal(t, list.len("shops"), 1, "the customer's own shop is listed")
	equal(t, list.str("shops.0.name"), "Nima's Shop", "by name")
	equal(t, list.get("shops.0.yours"), any(true), "marked as theirs")
	equal(t, list.num("shops.0.items_count"), int64(0), "with no items yet")
	equal(t, pema.get(fmt.Sprintf("/api/shops/%d", shopID)).Status, 200, "and its page opens")

	stranger := a.browser()
	stranger.openShop("Other", "other@shop.bt")
	equal(t, stranger.get("/api/shops").len("shops"), 0, "not for someone outside its book")
	equal(t, stranger.get(fmt.Sprintf("/api/shops/%d", shopID)).Status, 404, "nor its page")
	equal(t, a.browser().get("/api/public/shops").len("shops"), 0, "nor on the public list")
}
