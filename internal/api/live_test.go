package api_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestAnOpenTabHearsANotificationAsItIsWritten(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Dawa")
	dawa := a.browser()
	dawa.join(owner.invitePath(account), "Dawa Tashi", "dawa@example.bt")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	address := "ws" + strings.TrimPrefix(a.server.URL, "http") + "/api/live"

	_, refused, err := websocket.Dial(ctx, address, &websocket.DialOptions{HTTPClient: a.browser().client, Host: "bangkee.test"})
	if err == nil {
		t.Fatal("a signed-out tab was let in")
	}
	equal(t, refused.StatusCode, 401, "signed in only")
	_, refused, _ = websocket.Dial(ctx, address, &websocket.DialOptions{HTTPClient: dawa.client, Host: "bangkee.test",
		HTTPHeader: http.Header{"Origin": {"https://elsewhere.example"}}})
	equal(t, refused.StatusCode, 403, "not from another site's page")

	conn, _, err := websocket.Dial(ctx, address, &websocket.DialOptions{HTTPClient: dawa.client, Host: "bangkee.test"})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	// The socket is open before the credit is written; give the subscription
	// the moment it takes to register.
	time.Sleep(100 * time.Millisecond)

	credit := owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "288", "description": "Rice"})
	_, raw, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var heard map[string]any
	_ = json.Unmarshal(raw, &heard)
	equal(t, heard["title"], any("New credit at Karma's Shop"), "heard live")
	equal(t, heard["body"], any("Nu. 288 · Rice"), "what and how much")
	equal(t, heard["path"], any(fmt.Sprintf("/accounts/%d?entry=%d", account, credit.num("transaction_id"))), "opens at the entry")
	equal(t, heard["id"], any(float64(dawa.get("/api/notifications").num("notifications.0.id"))), "the bell's own notification")
}
