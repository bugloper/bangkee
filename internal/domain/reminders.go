package domain

import (
	"context"
	"time"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Reminding customers what they owe. Bangkee reminds a customer who has
// joined through its own notification (in the app, Web Push, and email when
// they have one). A customer who has not joined is reminded by WhatsApp from
// Bangkee's own business number when the WhatsApp Business API is set up
// (notify/whatsapp.go); otherwise only the owner can reach them, from their
// own WhatsApp or SMS — the app opens it with the message written, and
// records that it was sent. Bangkee has no SMS sender.
//
// Whatever happens is written down: a reminder sent, one skipped and why,
// one whose delivery failed. Bangkee never reminds:
//   - an account that owes nothing;
//   - a customer who turned reminders off for themselves;
//   - an account the owner paused;
//   - an account with an entry the customer has flagged and the shop has not
//     settled — chasing money that is in dispute is how trust is lost;
//   - the same account twice in one day (a unique index, not a check that
//     can race).

const (
	ReminderAutomatic = "automatic"
	ReminderManual    = "manual"
	ChannelApp        = "app"
	ChannelWhatsApp   = "whatsapp"
	ChannelSMS        = "sms"
	// ChannelBangkeeWhatsApp: sent by Bangkee through the WhatsApp Business API.
	ChannelBangkeeWhatsApp = "bangkee_whatsapp"
)

// notJoined is why a customer who has not joined is skipped when Bangkee
// cannot send WhatsApp itself.
const notJoined = "Has not joined Bangkee — remind them by WhatsApp or SMS"

// ReminderEveryDays are the paces a shop can choose from.
var ReminderEveryDays = []int32{1, 3, 7, 14, 30}

// The hours of the day, in Thimphu, a shop can have reminders go out.
const (
	FirstReminderHour = 7
	LastReminderHour  = 20
)

// ReminderOutcome is what happened when one account was reminded.
type ReminderOutcome struct {
	AccountID    int64  `json:"account_id"`
	CustomerName string `json:"customer_name"`
	Status       string `json:"status"` // sent | skipped | failed | duplicate
	Detail       string `json:"detail"`
	Channel      string `json:"channel"` // app | bangkee_whatsapp
	ReminderID   int64  `json:"-"`
}

// reasonToSkip says why this account is not reminded through Bangkee, or "".
func reasonToSkip(ctx context.Context, q *store.Queries, account store.Account) (string, error) {
	if account.BalanceCents <= 0 {
		return "Nothing is owed", nil
	}
	if account.RemindersPaused {
		return "Reminders are paused for this customer", nil
	}
	disputes, err := q.OpenDisputeCount(ctx, account.ID)
	if err != nil {
		return "", err
	}
	if disputes > 0 {
		return "They have flagged an entry — settle it first", nil
	}
	if account.CustomerID == nil {
		return notJoined, nil
	}
	customer, err := q.UserByID(ctx, *account.CustomerID)
	if err != nil {
		return "", err
	}
	if customer.RemindersOptOut {
		return "They turned reminders off", nil
	}
	return "", nil
}

func thimphuDay(now time.Time) time.Time {
	local := now.In(Thimphu)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}

// Remind records a reminder through Bangkee for one account: sent, or
// skipped with the reason. With byWhatsApp (the WhatsApp Business API is set
// up), a customer who has not joined but has a phone number is reminded on
// WhatsApp instead of skipped. The caller delivers it once the transaction
// has committed, and marks it failed if delivery could not be started.
func Remind(ctx context.Context, q *store.Queries, account store.Account, kind string, by *int64, now time.Time, byWhatsApp bool) (ReminderOutcome, error) {
	out := ReminderOutcome{AccountID: account.ID, CustomerName: account.CustomerName, Channel: ChannelApp}
	reason, err := reasonToSkip(ctx, q, account)
	if err != nil {
		return out, err
	}
	if reason == notJoined && byWhatsApp && account.CustomerPhone != nil && ValidPhone(*account.CustomerPhone) {
		reason, out.Channel = "", ChannelBangkeeWhatsApp
	}
	status := "sent"
	if reason != "" {
		status = "skipped"
	}
	id, err := q.InsertReminder(ctx, store.InsertReminderParams{
		AccountID: account.ID, Kind: kind, Channel: out.Channel, Status: status, Detail: util.Presence(reason),
		BalanceCents: account.BalanceCents, SentByID: by, RemindedOn: thimphuDay(now),
	})
	if err != nil {
		return out, err
	}
	if id == 0 {
		out.Status, out.Detail = "duplicate", "Already reminded today"
		return out, nil
	}
	out.Status, out.Detail, out.ReminderID = status, reason, id
	return out, nil
}

// AutomaticReminderDue: this overdue account was last reminded (or tried)
// at least the shop's pace ago, counted in Thimphu days — every 7 days means
// Monday, then next Monday, whatever the minute the job ran.
func AutomaticReminderDue(ctx context.Context, q *store.Queries, account store.Account, everyDays int32, now time.Time) (bool, error) {
	last, err := q.LastReminderDay(ctx, account.ID)
	if err != nil {
		return false, err
	}
	return !last.After(thimphuDay(now).AddDate(0, 0, -int(everyDays))), nil
}

// LogPhoneReminder records a reminder the owner sent from their own phone.
func LogPhoneReminder(ctx context.Context, q *store.Queries, account store.Account, channel string, by int64, now time.Time) error {
	if channel != ChannelWhatsApp && channel != ChannelSMS {
		return apperr.NewRule("Choose WhatsApp or SMS.")
	}
	if account.CustomerPhone == nil || *account.CustomerPhone == "" {
		return apperr.NewRule("This customer has no phone number.")
	}
	_, err := q.InsertReminder(ctx, store.InsertReminderParams{
		AccountID: account.ID, Kind: ReminderManual, Channel: channel, Status: "sent",
		BalanceCents: account.BalanceCents, SentByID: &by, RemindedOn: thimphuDay(now),
	})
	return err
}

type ReminderSettingsInput struct {
	Enabled   bool  `json:"enabled"`
	EveryDays int32 `json:"every_days"`
	Hour      int32 `json:"hour"`
}

func UpdateReminderSettings(ctx context.Context, q *store.Queries, shopID int64, in ReminderSettingsInput) error {
	var errs apperr.Errors
	known := false
	for _, d := range ReminderEveryDays {
		known = known || d == in.EveryDays
	}
	errs.Check(known, "Choose how often: every 1, 3, 7, 14 or 30 days")
	errs.Check(in.Hour >= FirstReminderHour && in.Hour <= LastReminderHour, "Choose an hour between 7 in the morning and 8 in the evening")
	if err := errs.Err(); err != nil {
		return err
	}
	return q.UpdateReminderSettings(ctx, store.UpdateReminderSettingsParams{ID: shopID, RemindersEnabled: in.Enabled, ReminderEveryDays: in.EveryDays, ReminderHour: in.Hour})
}

// DeliveryDTO is how a reminder's notification went out by push or email.
type DeliveryDTO struct {
	Channel string  `json:"channel"` // push | email
	Status  string  `json:"status"`  // sent | failed
	Detail  *string `json:"detail"`
}

type ReminderDTO struct {
	Deliveries   []DeliveryDTO `json:"deliveries"`
	Kind         string        `json:"kind"`
	Channel      string        `json:"channel"`
	Status       string        `json:"status"`
	Detail       *string       `json:"detail"`
	BalanceCents int64         `json:"balance_cents"`
	SentByName   *string       `json:"sent_by_name"`
	At           time.Time     `json:"at"`
}

func ReminderHistory(ctx context.Context, q *store.Queries, accountID int64) ([]ReminderDTO, error) {
	rows, err := q.AccountReminders(ctx, accountID)
	if err != nil {
		return nil, err
	}
	ids := []int64{}
	for _, r := range rows {
		if r.NotificationID != nil {
			ids = append(ids, *r.NotificationID)
		}
	}
	deliveries := map[int64][]DeliveryDTO{}
	if len(ids) > 0 {
		found, err := q.ReminderDeliveries(ctx, ids)
		if err != nil {
			return nil, err
		}
		for _, d := range found {
			deliveries[d.NotificationID] = append(deliveries[d.NotificationID], DeliveryDTO{Channel: d.Channel, Status: d.Status, Detail: d.Detail})
		}
	}
	out := make([]ReminderDTO, 0, len(rows))
	for _, r := range rows {
		dto := ReminderDTO{Kind: r.Kind, Channel: r.Channel, Status: r.Status, Detail: r.Detail, BalanceCents: r.BalanceCents, SentByName: r.SentByName, At: r.CreatedAt, Deliveries: []DeliveryDTO{}}
		if r.NotificationID != nil {
			dto.Deliveries = append(dto.Deliveries, deliveries[*r.NotificationID]...)
		}
		out = append(out, dto)
	}
	return out, nil
}
