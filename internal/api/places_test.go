package api_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

// A pin becomes "street, town", asked of Nominatim once per spot, with the
// shop's own name for the app; a failure leaves the field empty instead of
// failing the screen; and only shops can ask.
func TestAPinBecomesAStreetAndTown(t *testing.T) {
	var calls atomic.Int32
	var agent string
	nominatim := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		agent = r.Header.Get("User-Agent")
		if r.URL.Query().Get("lat") == "1.000000" {
			http.Error(w, "busy", http.StatusServiceUnavailable)
			return
		}
		fmt.Fprint(w, `{"address":{"road":"Norzin Lam","suburb":"Changzamtog","city":"Thimphu","country":"Bhutan"}}`)
	}))
	defer nominatim.Close()

	a := newApp(t)
	a.api.UsePlacesEndpoint(nominatim.URL)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")

	r := owner.get("/api/places/name?lat=27.4728&lon=89.6393")
	equal(t, r.str("name"), "Norzin Lam, Thimphu", "street and town")
	equal(t, agent, "Bangkee/1.0 (+https://bangkee.app)", "says who is asking")
	owner.get("/api/places/name?lat=27.47281&lon=89.63931")
	equal(t, calls.Load(), int32(1), "a pin a few metres away is answered from memory")

	equal(t, owner.get("/api/places/name?lat=1&lon=1").str("name"), "", "Nominatim failing leaves the field to the owner")
	equal(t, owner.get("/api/places/name?lat=200&lon=1").Status, 422, "not a place on the map")

	customer := a.browser()
	customer.join(owner.invitePath(owner.addCustomer("Pema")), "Pema", "pema@example.bt")
	equal(t, customer.get("/api/places/name?lat=27.4728&lon=89.6393").Status, 403, "for shops only")
}
