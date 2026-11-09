package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"bangkee/internal/config"
)

// WhatsApp sends reminders through the WhatsApp Business Platform (Meta's
// Cloud API), to customers who have not joined Bangkee and so have no app to
// be reminded in. A business may only start a WhatsApp conversation with a
// message template Meta has approved, so the words live in that template in
// Meta's Business Manager, with three body variables in this order:
//
//	{{1}} the customer's name, {{2}} the shop's name, {{3}} what they owe ("Nu. 2,450")
//
// Meta accepting the message is all Bangkee learns: whether it reached the
// phone arrives by webhook, which Bangkee does not take. The reminder
// history says "accepted by WhatsApp", not "delivered".
//
// Nil (the usual case) when WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
// and WHATSAPP_REMINDER_TEMPLATE are not all set; reminders then go out as
// before, and customers who have not joined are left to the owner.
type WhatsApp struct {
	cfg      config.WhatsApp
	client   *http.Client
	endpoint string
}

// The Graph API version this was written against; Meta retires each version
// about two years after release.
const whatsAppAPI = "https://graph.facebook.com/v24.0"

func NewWhatsApp(cfg *config.WhatsApp) *WhatsApp {
	if cfg == nil {
		return nil
	}
	return &WhatsApp{cfg: *cfg, client: &http.Client{Timeout: 20 * time.Second}, endpoint: whatsAppAPI + "/" + cfg.PhoneNumberID + "/messages"}
}

// UseEndpoint points the sender at a test server.
func (w *WhatsApp) UseEndpoint(url string) { w.endpoint = url }

type whatsAppText struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// Reminder sends the reminder template to an international number
// ("97517123456"). The error says Meta did not accept it, in words an owner
// can read.
func (w *WhatsApp) Reminder(ctx context.Context, to, customerName, shopName, owed string) error {
	body, _ := json.Marshal(map[string]any{
		"messaging_product": "whatsapp",
		"to":                to,
		"type":              "template",
		"template": map[string]any{
			"name":     w.cfg.ReminderTemplate,
			"language": map[string]string{"code": "en"},
			"components": []map[string]any{{
				"type":       "body",
				"parameters": []whatsAppText{{"text", customerName}, {"text", shopName}, {"text", owed}},
			}},
		},
	})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, w.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+w.cfg.AccessToken)
	request.Header.Set("Content-Type", "application/json")
	response, err := w.client.Do(request)
	if err != nil {
		return fmt.Errorf("WhatsApp could not be reached")
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusOK {
		return nil
	}
	var failure struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if json.Unmarshal(raw, &failure) == nil && failure.Error.Message != "" {
		return fmt.Errorf("WhatsApp refused it: %s", failure.Error.Message)
	}
	return fmt.Errorf("WhatsApp refused it (%d)", response.StatusCode)
}
