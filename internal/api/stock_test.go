package api_test

import (
	"fmt"
	"strings"
	"testing"
)

// Inventory: a counted item's stock follows what leaves the shop on credit
// and in cash sales, comes back when either is crossed out, and is topped up
// by restocking and corrected by a recount — each step on its history.
func TestStockFollowsCreditsAndSales(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	rice := owner.post("/api/menu_items", map[string]any{
		"name": "Rice 25 kg", "price": "620", "available": true,
		"counting": map[string]any{"count": true, "stock": "10", "low_stock_at": "3", "cost": "540"},
	})
	equal(t, rice.Status, 200, "a counted item")
	id := rice.num("id")
	tea := owner.post("/api/menu_items", map[string]any{"name": "Tea", "price": "20", "available": true}).num("id")
	item := func() response { return owner.get(fmt.Sprintf("/api/menu_items/%d", id)) }
	equal(t, item().num("stock"), int64(10), "starts at its count")
	equal(t, item().str("cost"), "540", "with its buying price")

	pema := owner.addCustomer("Pema")
	credit := owner.post(fmt.Sprintf("/api/accounts/%d/credits", pema), map[string]any{
		"itemized": true, "notes": "one bag opened",
		"line_items": []map[string]any{{"name": "Rice 25 kg", "quantity": "2", "unit_price": "620", "menu_item_id": id}, {"name": "Tea", "quantity": "1", "unit_price": "20", "menu_item_id": tea}},
	})
	equal(t, credit.Status, 200, "an itemized credit")
	equal(t, item().num("stock"), int64(8), "takes what was taken")

	sale := owner.post("/api/sales", map[string]any{
		"itemized": true, "payment_method": "Cash",
		"line_items": []map[string]any{{"name": "Rice 25 kg", "quantity": "5", "unit_price": "620", "menu_item_id": id}},
	})
	equal(t, sale.Status, 200, "a cash sale")
	equal(t, item().num("stock"), int64(3), "takes what was sold")
	equal(t, item().get("low"), any(true), "now running low")
	notes := owner.get("/api/notifications")
	equal(t, notes.str("notifications.0.title"), "Rice 25 kg is running low", "the owner was told")
	equal(t, notes.str("notifications.0.kind"), "stock", "as a stock note")
	equal(t, owner.get("/api/dashboard").str("low_stock.0.name"), "Rice 25 kg", "and Home lists it")

	half := owner.post("/api/sales", map[string]any{
		"itemized": true, "payment_method": "Cash",
		"line_items": []map[string]any{{"name": "Rice 25 kg", "quantity": "0.5", "unit_price": "620", "menu_item_id": id}},
	})
	equal(t, half.Status, 422, "a counted item is sold whole")
	equal(t, fmt.Sprint(half.get("errors")), "[Rice 25 kg is counted in whole units: put details such as 2.5 kg in the note]", "details go in the note")

	equal(t, owner.post(fmt.Sprintf("/api/sales/%d/cross_out", sale.num("sale_id")), nil).Status, 200, "the sale crossed out")
	equal(t, item().num("stock"), int64(8), "puts the stock back")
	equal(t, owner.post(fmt.Sprintf("/api/transactions/%d/cross_out", credit.num("transaction_id")), nil).Status, 200, "the credit crossed out")
	equal(t, item().num("stock"), int64(10), "puts it back too")

	restock := owner.post(fmt.Sprintf("/api/menu_items/%d/restock", id), map[string]any{"quantity": "20", "cost": "550", "notes": "From Druk Traders"})
	equal(t, restock.Status, 200, "restocked")
	equal(t, item().num("stock"), int64(30), "adds what came in")
	equal(t, item().str("cost"), "550", "at the new buying price")
	equal(t, owner.post(fmt.Sprintf("/api/menu_items/%d/restock", id), map[string]any{"quantity": "0"}).Status, 422, "something must come in")
	equal(t, owner.post(fmt.Sprintf("/api/menu_items/%d/restock", tea), map[string]any{"quantity": "5"}).Status, 422, "an item that is not counted is not restocked")
	equal(t, owner.post(fmt.Sprintf("/api/menu_items/%d/recount", id), map[string]any{"counted": "27", "notes": "3 bags damp"}).Status, 200, "recounted")
	equal(t, item().num("stock"), int64(27), "the count is what is on the shelf")
	list := owner.get("/api/menu_items")
	equal(t, list.num("stock_value_cents"), int64(27*55_000), "stock valued at its buying price")

	history := owner.get(fmt.Sprintf("/api/menu_items/%d/stock", id))
	reasons := []string{}
	for i := range history.len("history") {
		reasons = append(reasons, history.str(fmt.Sprintf("history.%d.reason", i)))
	}
	equal(t, strings.Join(reasons, ","), "correction,restock,credit_crossed_out,sale_crossed_out,sale,credit,started", "every change, newest first")
	equal(t, history.num("history.0.change"), int64(-3), "the correction's change")
	equal(t, history.str("history.1.notes"), "From Druk Traders", "with its note")

	// Editing the item from the list's in-stock switch leaves the count alone.
	equal(t, owner.patch(fmt.Sprintf("/api/menu_items/%d", id), map[string]any{"name": "Rice 25 kg", "price": "620", "available": true}).Status, 200, "switch")
	equal(t, item().num("stock"), int64(27), "count kept")
	// Stopping counting clears it; the item carries on as before.
	equal(t, owner.patch(fmt.Sprintf("/api/menu_items/%d", id), map[string]any{"name": "Rice 25 kg", "price": "620", "available": true, "counting": map[string]any{"count": false}}).Status, 200, "stop counting")
	equal(t, item().get("stock"), nil, "not counted")
}

// Customers read "Only 3 left" when a counted item runs low and "Out of
// stock" at 0, and never see the count otherwise or what the shop paid.
func TestCustomersSeeWhenStockIsLow(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	momo := owner.post("/api/menu_items", map[string]any{"name": "Momo", "price": "60", "available": true, "counting": map[string]any{"count": true, "stock": "40", "cost": "30"}}).num("id")
	coke := owner.post("/api/menu_items", map[string]any{"name": "Coke", "price": "50", "available": true, "counting": map[string]any{"count": true, "stock": "3"}}).num("id")
	owner.post("/api/menu_items", map[string]any{"name": "Tea", "price": "20", "available": true})
	visitor := a.browser()
	shop := visitor.get("/api/public/shops").num("shops.0.id")
	page := func() response { return visitor.get(fmt.Sprintf("/api/public/shops/%d", shop)) }
	find := func(name string) map[string]any {
		for _, group := range page().get("menu").([]any) {
			for _, item := range group.(map[string]any)["items"].([]any) {
				if item.(map[string]any)["name"] == name {
					return item.(map[string]any)
				}
			}
		}
		t.Fatalf("%s not listed", name)
		return nil
	}
	equal(t, find("Momo")["left"], nil, "plenty: no count shown")
	equal(t, find("Coke")["left"], any(float64(3)), "Only 3 left")
	equal(t, find("Tea")["left"], nil, "not counted")
	_, costShown := find("Momo")["cost"]
	equal(t, costShown, false, "the buying price stays the shop's")
	equal(t, owner.post(fmt.Sprintf("/api/menu_items/%d/recount", coke), map[string]any{"counted": "0"}).Status, 200, "sold out")
	equal(t, find("Coke")["available"], any(false), "out of stock")
	equal(t, owner.get("/api/notifications").str("notifications.0.title"), "Coke is out of stock", "the owner was told")
	_ = momo
}
