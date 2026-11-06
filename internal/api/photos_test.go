package api_test

import (
	"fmt"
	"strings"
	"testing"
)

func TestPeopleAndShopsHavePhotosAndAShopHasAPinOnTheMap(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	owner.post("/api/menu_items", map[string]any{"name": "Momo", "price": "80", "available": true})
	account := owner.addCustomer("Dawa")
	dawa := a.browser()
	dawa.join(owner.invitePath(account), "Dawa Tashi", "dawa@example.bt")

	// A customer's own photo: on them, and beside their name in the shop's book.
	equal(t, dawa.get("/api/me").get("user.photo_url"), any(nil), "none yet")
	equal(t, fmt.Sprint(dawa.multipart("/api/me/photo", nil, "", nil).get("errors")), "[Photo must be attached]", "nothing sent")
	equal(t, dawa.multipart("/api/me/photo", nil, "image", screenshot(t)).str("notice"), "Profile photo saved.", "saved")
	photo := dawa.get("/api/me").str("user.photo_url")
	equal(t, strings.HasPrefix(photo, "/api/attachments/"), true, "has an address")
	equal(t, owner.get("/api/accounts").str("accounts.0.customer_photo_url"), photo, "the owner sees it in the list")
	equal(t, owner.get(fmt.Sprintf("/api/accounts/%d", account)).str("account.customer_photo_url"), photo, "and on the account")
	equal(t, owner.get(photo).Status, 200, "served to someone signed in")
	equal(t, a.browser().get(photo).Status, 401, "not to someone signed out")
	dawa.multipart("/api/me/photo", nil, "image", screenshot(t))
	equal(t, a.storedFiles(), 1, "a new photo replaces the old")
	equal(t, dawa.delete("/api/me/photo").str("notice"), "Profile photo removed.", "removed")
	equal(t, dawa.get("/api/me").get("user.photo_url"), any(nil), "gone")
	equal(t, a.storedFiles(), 0, "file and all")

	// The shop's photo: in the directory, on its page, and on the customer's account.
	equal(t, dawa.post("/api/shop/photo", nil).Status, 403, "owners only")
	equal(t, owner.multipart("/api/shop/photo", nil, "image", screenshot(t)).str("notice"), "Shop photo saved.", "saved")
	shopPhoto := owner.get("/api/shop/profile").str("shop.photo_url")
	equal(t, shopPhoto != "", true, "on the profile")
	equal(t, dawa.get("/api/shops").str("shops.0.photo_url"), shopPhoto, "in the directory")
	equal(t, dawa.get(fmt.Sprintf("/api/accounts/%d", account)).str("shop.photo_url"), shopPhoto, "on the customer's account")
	equal(t, dawa.get("/api/dashboard").str("accounts.0.shop.photo_url"), shopPhoto, "on the customer's home")
	equal(t, dawa.get(shopPhoto).Status, 200, "the customer can see it")
	equal(t, owner.delete("/api/shop/photo").str("notice"), "Shop photo removed.", "removed")

	// A pin on the map: both coordinates or neither, and on the globe.
	profile := map[string]any{"name": "Karma's Shop", "kind": "general_store", "location": "Norzin Lam, Thimphu"}
	profile["latitude"] = 27.4716
	equal(t, fmt.Sprint(owner.patch("/api/shop/profile", profile).get("errors")), "[Place the pin on the map, or clear it]", "half a pin")
	profile["longitude"] = 289.0
	equal(t, fmt.Sprint(owner.patch("/api/shop/profile", profile).get("errors")), "[That pin is not on the map]", "off the globe")
	profile["longitude"] = 89.6386
	equal(t, owner.patch("/api/shop/profile", profile).str("notice"), "Shop profile saved.", "pinned")
	page := dawa.get(fmt.Sprintf("/api/shops/%d", dawa.get("/api/shops").num("shops.0.id")))
	equal(t, page.get("shop.latitude"), any(27.4716), "the customer sees where")
	equal(t, page.get("shop.longitude"), any(89.6386), "both coordinates")
	equal(t, page.str("shop.kind_label"), "General store", "one of the new types")
	delete(profile, "latitude")
	delete(profile, "longitude")
	owner.patch("/api/shop/profile", profile)
	equal(t, owner.get("/api/shop/profile").get("shop.latitude"), any(nil), "the pin can be cleared")
}
