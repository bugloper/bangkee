// Package notify knows who cares about what. Every event writes an in-app
// notification (the bell) and hands it to the person's open tabs, Web Push
// and email, so they never disagree.
//
// It is called after the request's database work has committed: a mail
// server that is down or a push endpoint that is gone can never stop the
// ledger from being written (§16.9, §17.9), and a failure here is logged,
// not returned.
package notify

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"log/slog"
	"net/mail"
	"net/smtp"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5/pgxpool"

	"bangkee/internal/config"
	"bangkee/internal/domain"
	"bangkee/internal/money"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

type Notifier struct {
	db  *pgxpool.Pool
	q   *store.Queries
	cfg config.Config
	// Live is who has Bangkee open; the API's /live socket subscribes to it.
	Live *Live
	// Deliveries run in the background; Wait lets tests and shutdown let them finish.
	pending sync.WaitGroup
}

func New(db *pgxpool.Pool, cfg config.Config) *Notifier {
	return &Notifier{db: db, q: store.New(db), cfg: cfg, Live: newLive()}
}

// Wait blocks until every delivery started so far has finished.
func (n *Notifier) Wait() { n.pending.Wait() }

type note struct {
	userID      int64
	kind, title string
	body, path  string
}

func (n *Notifier) deliver(ctx context.Context, notes ...note) {
	for _, nt := range notes {
		if err := n.deliverOne(ctx, nt); err != nil {
			slog.Error("could not write a notification", "error", err)
		}
	}
}

// deliverOne writes the notification and starts pushing and mailing it. An
// error means nothing reached the person; push and email failures after that
// are logged, as the in-app notification is already there.
func (n *Notifier) deliverOne(ctx context.Context, nt note) error {
	id, err := n.q.CreateNotification(ctx, store.CreateNotificationParams{
		UserID: nt.userID, Kind: nt.kind, Title: nt.title, Body: util.Presence(nt.body), Path: util.Presence(nt.path),
	})
	if err != nil {
		return err
	}
	n.Live.publish(nt.userID, message(id, nt.kind, nt.title, util.Presence(nt.body), util.Presence(nt.path)))
	n.pending.Add(1)
	go func() {
		defer n.pending.Done()
		background, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		n.push(background, id)
		n.email(background, id)
	}()
	return nil
}

func accountPath(id int64) string { return fmt.Sprintf("/accounts/%d", id) }

// entryPath opens the account at one entry, which the account screen highlights.
func entryPath(accountID, entryID int64) string {
	return fmt.Sprintf("/accounts/%d?entry=%d", accountID, entryID)
}

// message is a notification as an open tab and the service worker read it.
func message(id int64, kind, title string, body, path *string) []byte {
	payload, _ := json.Marshal(map[string]any{
		"id": id, "title": title, "body": body, "path": path, "kind": kind, "tag": pushTag(id, kind, path),
	})
	return payload
}

type accountContext struct {
	account  store.Account
	shopName string
	ownerID  int64
}

func (n *Notifier) context(ctx context.Context, accountID int64) (*accountContext, bool) {
	account, err := n.q.AccountByID(ctx, accountID)
	if err != nil {
		return nil, false
	}
	shop, err := n.q.ShopByID(ctx, account.ShopID)
	if err != nil {
		return nil, false
	}
	return &accountContext{account, shop.Name, shop.OwnerID}, true
}

// toCustomer notifies the account's customer, when one has joined.
func (n *Notifier) toCustomer(ctx context.Context, accountID int64, build func(*accountContext) note) {
	c, ok := n.context(ctx, accountID)
	if !ok || c.account.CustomerID == nil {
		return // an account with no customer linked yet
	}
	nt := build(c)
	nt.userID = *c.account.CustomerID
	n.deliver(ctx, nt)
}

func (n *Notifier) CreditRecorded(ctx context.Context, accountID, entryID, amountCents int64, description *string) {
	n.toCustomer(ctx, accountID, func(c *accountContext) note {
		body := money.Ngultrum(amountCents, false)
		if description != nil && *description != "" {
			body += " · " + *description
		}
		return note{kind: "credit", title: "New credit at " + c.shopName, body: body, path: entryPath(accountID, entryID)}
	})
}

func (n *Notifier) PaymentRecorded(ctx context.Context, accountID, entryID, amountCents int64) {
	n.toCustomer(ctx, accountID, func(c *accountContext) note {
		return note{kind: "payment", title: "Payment recorded at " + c.shopName,
			body: fmt.Sprintf("%s — your balance is now %s", money.Ngultrum(amountCents, false), money.Ngultrum(c.account.BalanceCents, false)),
			path: entryPath(accountID, entryID)}
	})
}

func (n *Notifier) TransactionCrossedOut(ctx context.Context, accountID, entryID int64, kind string, amountCents int64) {
	label := "Payment"
	if kind == "credit" {
		label = "Credit"
	}
	n.toCustomer(ctx, accountID, func(c *accountContext) note {
		return note{kind: "cross_out", title: "Entry crossed out at " + c.shopName,
			body: fmt.Sprintf("%s of %s no longer counts", label, money.Ngultrum(amountCents, false)), path: entryPath(accountID, entryID)}
	})
}

// EntryDisputed tells the shop a customer has flagged an entry.
func (n *Notifier) EntryDisputed(ctx context.Context, accountID, entryID int64, kind string, amountCents int64, reason string) {
	if c, ok := n.context(ctx, accountID); ok {
		n.deliver(ctx, note{userID: c.ownerID, kind: "dispute", title: c.account.CustomerName + " flagged a " + kind + " of " + money.Ngultrum(amountCents, false),
			body: snippet(reason), path: entryPath(accountID, entryID)})
	}
}

// DisputeReplied tells the customer the shop has answered their flag.
func (n *Notifier) DisputeReplied(ctx context.Context, accountID, entryID int64, reply string) {
	n.toCustomer(ctx, accountID, func(c *accountContext) note {
		return note{kind: "dispute", title: c.shopName + " replied about an entry you flagged", body: snippet(reply), path: entryPath(accountID, entryID)}
	})
}

func (n *Notifier) AccountJoined(ctx context.Context, accountID int64) {
	if c, ok := n.context(ctx, accountID); ok {
		n.deliver(ctx, note{userID: c.ownerID, kind: "credit", title: c.account.CustomerName + " joined",
			body: "They can now see their balance at " + c.shopName, path: accountPath(accountID)})
	}
}

// PaymentReminder reminds the account's customer what they owe. The error
// says the reminder did not go out at all.
func (n *Notifier) PaymentReminder(ctx context.Context, accountID int64, creditDueDays int32) error {
	c, ok := n.context(ctx, accountID)
	if !ok || c.account.CustomerID == nil {
		return fmt.Errorf("account %d has no customer to remind", accountID)
	}
	body := money.Ngultrum(c.account.BalanceCents, false) + " is outstanding"
	if days := domain.DaysOverdue(c.account, creditDueDays); days > 0 {
		body += fmt.Sprintf(", with nothing paid for %d days", days)
	}
	return n.deliverOne(ctx, note{userID: *c.account.CustomerID, kind: "overdue", title: "A reminder from " + c.shopName,
		body: body + ". Open Bangkee to see the entries and how to pay.", path: accountPath(accountID)})
}

// RemindersDigest is the owner's one note after their shop's reminders went
// out: how many were reminded, and how many they need to reach themselves.
func (n *Notifier) RemindersDigest(ctx context.Context, ownerID int64, sent, skipped int) {
	if sent == 0 && skipped == 0 {
		return
	}
	title := "Reminded " + money.Pluralize(int64(sent), "overdue customer")
	body := "They were sent a note about what they owe."
	if skipped > 0 {
		body = money.Pluralize(int64(skipped), "customer") + " could not be reminded through Bangkee — see who, and remind them yourself."
	}
	n.deliver(ctx, note{userID: ownerID, kind: "overdue", title: title, body: body, path: "/accounts?filter=overdue"})
}

// SubscriptionPaymentSubmitted is §17: every platform admin hears about it.
func (n *Notifier) SubscriptionPaymentSubmitted(ctx context.Context, shopName string, amountCents int64, months int32) {
	admins, err := n.q.PlatformAdminIDs(ctx)
	if err != nil {
		slog.Error("could not load admins", "error", err)
		return
	}
	body := fmt.Sprintf("%s — %s for %s", shopName, money.Ngultrum(amountCents, false), money.Pluralize(int64(months), "month"))
	for _, id := range admins {
		n.deliver(ctx, note{userID: id, kind: "sub", title: "Subscription payment submitted", body: body, path: consoleQueuePath})
	}
}

// TrialEnding is the owner's note a few days before their free trial ends.
func (n *Notifier) TrialEnding(ctx context.Context, ownerID int64, days int64, annualCents int64) {
	n.deliver(ctx, note{userID: ownerID, kind: "sub", title: fmt.Sprintf("Your free trial ends in %d days", days),
		body: fmt.Sprintf("Pay %s for a year by bank transfer to keep recording credits and payments.", money.Ngultrum(annualCents, false)), path: "/subscription"})
}

func (n *Notifier) SubscriptionPaymentApproved(ctx context.Context, submittedBy int64, paidThrough time.Time) {
	n.deliver(ctx, note{userID: submittedBy, kind: "sub", title: "Subscription payment approved",
		body: "Paid through " + util.LongDate(paidThrough), path: "/subscription"})
}

func (n *Notifier) SubscriptionPaymentRejected(ctx context.Context, submittedBy int64, reason string) {
	if reason == "" {
		reason = "Bangkee could not match your transfer"
	}
	n.deliver(ctx, note{userID: submittedBy, kind: "sub", title: "Subscription payment rejected", body: reason, path: "/subscription"})
}

// FeedbackReceived: every platform admin hears about a new message.
func (n *Notifier) FeedbackReceived(ctx context.Context, from, kindLabel, body string) {
	admins, err := n.q.PlatformAdminIDs(ctx)
	if err != nil {
		slog.Error("could not load admins", "error", err)
		return
	}
	for _, id := range admins {
		n.deliver(ctx, note{userID: id, kind: "feedback", title: kindLabel + " from " + from, body: snippet(body), path: consoleFeedbackPath})
	}
}

// TestimonialReceived: every platform admin hears there is one to review.
func (n *Notifier) TestimonialReceived(ctx context.Context, from string) {
	admins, err := n.q.PlatformAdminIDs(ctx)
	if err != nil {
		slog.Error("could not load admins", "error", err)
		return
	}
	for _, id := range admins {
		n.deliver(ctx, note{userID: id, kind: "feedback", title: "A testimonial from " + from, body: "Read it and approve it for the homepage.", path: consoleTestimonialsPath})
	}
}

func (n *Notifier) FeedbackAcknowledged(ctx context.Context, userID int64, kindLabel, body string) {
	n.deliver(ctx, note{userID: userID, kind: "feedback", title: "Bangkee has seen your " + strings.ToLower(kindLabel), body: snippet(body), path: helpPath})
}

func (n *Notifier) FeedbackReplied(ctx context.Context, userID int64, kindLabel, reply string) {
	n.deliver(ctx, note{userID: userID, kind: "feedback", title: "Bangkee replied to your " + strings.ToLower(kindLabel), body: snippet(reply), path: helpPath})
}

// snippet keeps a notification to a glance: the start of a long message.
func snippet(text string) string {
	runes := []rune(strings.Join(strings.Fields(text), " "))
	if len(runes) <= 140 {
		return string(runes)
	}
	return strings.TrimSpace(string(runes[:139])) + "…"
}

// ----------------------------------------------------------------- push

// A push should be about something that just happened; one that has been
// sitting for hours is noise by the time it lands.
const pushTTL = 4 * 60 * 60

// pushTag: a shared tag makes one notification replace another, which is
// right for a reminder that repeats and wrong for money. Overdue reminders go
// out daily per account, so they collapse; everything else is its own event,
// and two arriving a minute apart must both survive.
func pushTag(id int64, kind string, path *string) string {
	if kind == "overdue" && path != nil && *path != "" {
		return "bangkee-overdue-" + *path
	}
	return fmt.Sprintf("bangkee-%s-%d", kind, id)
}

func (n *Notifier) push(ctx context.Context, notificationID int64) {
	vapid := n.cfg.Vapid
	if vapid == nil {
		return // push is switched off
	}
	notification, err := n.q.NotificationByID(ctx, notificationID)
	if err != nil {
		return
	}
	// What the service worker reads in its push handler.
	payload := message(notification.ID, notification.Kind, notification.Title, notification.Body, notification.Path)
	subscriptions, err := n.q.PushSubscriptionsFor(ctx, notification.UserID)
	if err != nil {
		return
	}
	for _, sub := range subscriptions {
		response, err := webpush.SendNotificationWithContext(ctx, payload,
			&webpush.Subscription{Endpoint: sub.Endpoint, Keys: webpush.Keys{P256dh: sub.P256dhKey, Auth: sub.AuthKey}},
			&webpush.Options{
				// webpush-go adds the "mailto:" itself.
				Subscriber:      strings.TrimPrefix(vapid.Subject, "mailto:"),
				VAPIDPublicKey:  vapid.PublicKey,
				VAPIDPrivateKey: vapid.PrivateKey,
				TTL:             pushTTL,
				Urgency:         webpush.UrgencyNormal,
			})
		if err != nil {
			slog.Warn("push failed", "endpoint", sub.Endpoint, "error", err)
			continue
		}
		response.Body.Close()
		switch {
		// The only moment we learn a device is gone (site data cleared, PWA
		// uninstalled): the push service answers 404 or 410.
		case response.StatusCode == 404 || response.StatusCode == 410:
			_ = n.q.DeletePushSubscriptionByID(ctx, sub.ID)
		case response.StatusCode >= 300:
			slog.Warn("push refused", "endpoint", sub.Endpoint, "status", response.StatusCode)
		}
	}
}

// ---------------------------------------------------------------- email
//
// §16.7 says email SHOULD accompany the in-app notification, so a missing
// mail server degrades to a log line rather than an error.

// The operator's queues on the console host, and where a person reads the
// answers to what they sent.
const (
	consoleQueuePath        = "/subscription_payments"
	consoleFeedbackPath     = "/feedback"
	consoleTestimonialsPath = "/testimonials"
	helpPath                = "/help"
)

// absolute links into the app, or into the console (admin.<host>) for the
// operator's own notifications.
func (n *Notifier) absolute(path string, console bool) string {
	if path == "" {
		path = "/"
	}
	host := n.cfg.Host
	if console {
		host = "admin." + host
	}
	return "https://" + host + path
}

func (n *Notifier) send(to, subject, text, htmlBody string) {
	if n.cfg.SMTP == nil {
		slog.Info("email (no SMTP configured)", "to", to, "subject", subject, "text", text)
		return
	}
	from, err := mail.ParseAddress(n.cfg.MailFrom)
	if err != nil {
		slog.Error("BANGKEE_MAIL_FROM is not an address", "error", err)
		return
	}
	boundary := "bangkee-" + util.SecureToken()
	message := strings.Join([]string{
		"From: " + from.String(),
		"To: " + to,
		"Subject: " + mimeHeader(subject),
		"MIME-Version: 1.0",
		`Content-Type: multipart/alternative; boundary="` + boundary + `"`,
		"",
		"--" + boundary,
		"Content-Type: text/plain; charset=utf-8",
		"",
		text,
		"--" + boundary,
		"Content-Type: text/html; charset=utf-8",
		"",
		htmlBody,
		"--" + boundary + "--",
		"",
	}, "\r\n")

	smtpCfg := n.cfg.SMTP
	var auth smtp.Auth
	if smtpCfg.UserName != "" {
		auth = smtp.PlainAuth("", smtpCfg.UserName, smtpCfg.Password, smtpCfg.Address)
	}
	// SendMail upgrades to STARTTLS whenever the server offers it.
	addr := fmt.Sprintf("%s:%d", smtpCfg.Address, smtpCfg.Port)
	if err := smtp.SendMail(addr, auth, from.Address, []string{to}, []byte(message)); err != nil {
		slog.Warn("email delivery failed", "to", to, "error", err)
	}
}

func mimeHeader(value string) string {
	return "=?utf-8?b?" + encodeBase64(value) + "?="
}

func (n *Notifier) email(ctx context.Context, notificationID int64) {
	notification, err := n.q.NotificationByID(ctx, notificationID)
	if err != nil {
		return
	}
	// A customer who joined with phone and PIN has no address: the bell and
	// push reach them, email does not.
	to, err := n.q.NotificationRecipientEmail(ctx, notification.UserID)
	if err != nil || to == nil {
		return
	}
	path := util.Deref(notification.Path)
	url := n.absolute(path, path == consoleQueuePath || path == consoleTestimonialsPath || (notification.Kind == "feedback" && path == consoleFeedbackPath))
	body := util.Deref(notification.Body)

	text := fmt.Sprintf("%s\n%s\n\n%s\n\nOpen Bangkee: %s\n\nYou are getting this because you use Bangkee, the shared credit book.\n",
		notification.Title, strings.Repeat("=", len([]rune(notification.Title))), body, url)

	bodyHTML := ""
	if body != "" {
		bodyHTML = `<p style="margin:0 0 20px;color:#434654">` + html.EscapeString(body) + `</p>`
	}
	htmlBody := `<div style="font-family:Inter,system-ui,-apple-system,Helvetica,Arial,sans-serif;color:#041b3c;font-size:16px;line-height:1.5">
  <div style="background:#003d9b;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0">
    <div style="font-size:20px;font-weight:800;letter-spacing:.3px">Bangkee</div>
  </div>
  <div style="border:1px solid #e0e4f0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
    <div style="font-size:18px;font-weight:700;margin-bottom:8px">` + html.EscapeString(notification.Title) + `</div>
    ` + bodyHTML + `
    <a href="` + html.EscapeString(url) + `" style="display:inline-block;background:#003d9b;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600">Open Bangkee</a>
    <p style="margin:24px 0 0;color:#737685;font-size:13px">You are getting this because you use Bangkee, the shared credit book.</p>
  </div>
</div>`
	n.send(*to, notification.Title, text, htmlBody)
}

// PasswordReset mails the reset link; it lives for 15 minutes.
func (n *Notifier) PasswordReset(to, token string) {
	url := n.absolute("/passwords/"+token+"/edit", false)
	n.pending.Add(1)
	go func() {
		defer n.pending.Done()
		n.send(to, "Reset your password",
			"You can reset your password on\n"+url+"\n\nThis link will expire in 15 minutes.\n",
			`<p>You can reset your password on <a href="`+html.EscapeString(url)+`">this password reset page</a>. This link will expire in 15 minutes.</p>`)
	}()
}

func encodeBase64(value string) string { return base64.StdEncoding.EncodeToString([]byte(value)) }
