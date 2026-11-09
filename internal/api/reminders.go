package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/domain"
	"bangkee/internal/money"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Reminders: the hourly job that sends each shop's automatic reminders at
// the hour it chose, the owner's own reminders (one customer, or every
// overdue one), and the settings and history behind them. The rules about
// who is reminded are in domain/reminders.go.

// ScheduleReminders runs at the top of every hour. Each run reminds the
// overdue customers of the shops whose reminder hour it is in Thimphu, and
// at 8am tells owners whose free trial is about to end.
func (s *Server) ScheduleReminders(ctx context.Context) {
	go func() {
		for {
			now := time.Now()
			next := now.Truncate(time.Hour).Add(time.Hour)
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Until(next)):
			}
			s.RunReminders(ctx, time.Now())
		}
	}()
}

// RunReminders is one run of the job, for the hour `now` falls in. A shop
// that fails is logged and skipped; the others still get their reminders.
func (s *Server) RunReminders(ctx context.Context, now time.Time) {
	hour := int32(now.In(domain.Thimphu).Hour())
	shops, err := s.Q.ShopsDueForReminders(ctx, hour)
	if err != nil {
		slog.Error("reminders: could not list shops", "error", err)
	}
	for _, shop := range shops {
		if err := s.remindShop(ctx, shop, now); err != nil {
			slog.Error("reminders: a shop's run failed", "shop", shop.ID, "error", err)
		}
	}
	if hour == 8 {
		if err := s.TrialEndingReminders(ctx); err != nil {
			slog.Error("trial reminders failed", "error", err)
		}
	}
}

// remindShop sends one shop's automatic reminders, each overdue account at
// the shop's pace, and tells the owner once.
func (s *Server) remindShop(ctx context.Context, shop store.Shop, now time.Time) error {
	if allowed, err := s.planAllows(ctx, s.Q, shop.ID, domain.FeatureAutomaticReminders); err != nil || !allowed {
		return err
	}
	overdue, err := s.Q.OverdueAccounts(ctx, store.OverdueAccountsParams{ShopID: shop.ID, Threshold: now.AddDate(0, 0, -int(shop.CreditDueDays))})
	if err != nil {
		return err
	}
	sent, skipped := 0, 0
	for _, account := range overdue {
		due, err := domain.AutomaticReminderDue(ctx, s.Q, account, shop.ReminderEveryDays, now)
		if err != nil {
			return err
		}
		if !due {
			continue
		}
		outcome, err := domain.Remind(ctx, s.Q, account, domain.ReminderAutomatic, nil, now)
		if err != nil {
			return err
		}
		switch s.deliverReminder(ctx, &outcome, shop.CreditDueDays) {
		case "sent":
			sent++
		case "skipped", "failed":
			skipped++
		}
	}
	s.Notify.RemindersDigest(ctx, shop.OwnerID, sent, skipped)
	return nil
}

// deliverReminder sends a reminder that was recorded as sent, and marks it
// failed if it could not go out. Returns the final status.
func (s *Server) deliverReminder(ctx context.Context, outcome *domain.ReminderOutcome, creditDueDays int32) string {
	if outcome.Status != "sent" {
		return outcome.Status
	}
	if err := s.Notify.PaymentReminder(ctx, outcome.AccountID, creditDueDays); err != nil {
		slog.Error("reminder not delivered", "account", outcome.AccountID, "error", err)
		outcome.Status, outcome.Detail = "failed", "Could not be delivered — try again later"
		if err := s.Q.MarkReminderFailed(ctx, store.MarkReminderFailedParams{ID: outcome.ReminderID, Detail: util.Ptr(outcome.Detail)}); err != nil {
			slog.Error("could not mark the reminder failed", "error", err)
		}
	}
	return outcome.Status
}

// TrialEndingReminders tells each owner whose free trial ends in
// TrialEndingDays days. The job runs once a day and days remaining counts
// down by one a day, so each trial is told exactly once.
func (s *Server) TrialEndingReminders(ctx context.Context) error {
	shops, err := s.Q.AllShops(ctx)
	if err != nil {
		return err
	}
	now := time.Now()
	for _, shop := range shops {
		sub, err := domain.SubscriptionFor(ctx, s.Q, shop.ID)
		if err != nil {
			return err
		}
		if sub != nil && domain.EffectiveStatus(*sub, now) == domain.Trialing && domain.DaysRemaining(*sub) == domain.TrialEndingDays {
			s.Notify.TrialEnding(ctx, shop.OwnerID, domain.TrialEndingDays, 12*sub.PriceCents)
		}
	}
	return nil
}

// --------------------------------------------------------- the owner's side

func outcomeMessage(o domain.ReminderOutcome) string {
	switch o.Status {
	case "sent":
		return "Reminder sent to " + o.CustomerName + "."
	case "duplicate":
		return o.CustomerName + " was already reminded today."
	case "failed":
		return "The reminder to " + o.CustomerName + " could not be delivered. Try again later."
	default:
		return "Not sent: " + o.Detail + "."
	}
}

// remind is the owner reminding one customer now, through Bangkee.
func (s *Server) remind(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var outcome domain.ReminderOutcome
	err = s.tx(ctx, func(q *store.Queries) error {
		account, err := q.AccountInShop(ctx, store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
		if err != nil {
			return err
		}
		outcome, err = domain.Remind(ctx, q, account, domain.ReminderManual, &o.User.ID, time.Now())
		return err
	})
	if err != nil {
		return err
	}
	s.deliverReminder(ctx, &outcome, o.Shop.CreditDueDays)
	return notice(c, outcomeMessage(outcome), M{"outcome": outcome})
}

// remindAll reminds every overdue customer now — the accounts the owner
// picked, or all of them.
func (s *Server) remindAll(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	if err := s.requireFeature(c.Request().Context(), o.Shop.ID, domain.FeatureBulkReminders); err != nil {
		return err
	}
	var in struct {
		AccountIDs []int64 `json:"account_ids"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	now := time.Now()
	overdue, err := s.Q.OverdueAccounts(ctx, store.OverdueAccountsParams{ShopID: o.Shop.ID, Threshold: now.AddDate(0, 0, -int(o.Shop.CreditDueDays))})
	if err != nil {
		return err
	}
	picked := map[int64]bool{}
	for _, id := range in.AccountIDs {
		picked[id] = true
	}
	outcomes := []domain.ReminderOutcome{}
	sent := 0
	for _, account := range overdue {
		if len(picked) > 0 && !picked[account.ID] {
			continue
		}
		outcome, err := domain.Remind(ctx, s.Q, account, domain.ReminderManual, &o.User.ID, now)
		if err != nil {
			return err
		}
		if s.deliverReminder(ctx, &outcome, o.Shop.CreditDueDays) == "sent" {
			sent++
		}
		outcomes = append(outcomes, outcome)
	}
	message := "Reminded " + money.Pluralize(int64(sent), "customer") + "."
	if len(outcomes) == 0 {
		message = "Nobody is overdue."
	}
	return notice(c, message, M{"outcomes": outcomes, "sent": sent})
}

// logReminder records a reminder the owner sent from their own WhatsApp or SMS.
func (s *Server) logReminder(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in struct {
		Channel string `json:"channel"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	account, err := s.Q.AccountInShop(ctx, store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
	if err != nil {
		return err
	}
	if err := domain.LogPhoneReminder(ctx, s.Q, account, in.Channel, o.User.ID, time.Now()); err != nil {
		return err
	}
	return notice(c, "Noted in the reminder history.", nil)
}

func (s *Server) accountReminders(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	account, err := s.Q.AccountInShop(ctx, store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
	if err != nil {
		return err
	}
	history, err := domain.ReminderHistory(ctx, s.Q, account.ID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"paused": account.RemindersPaused, "reminders": history})
}

func (s *Server) pauseReminders(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in struct {
		Paused bool `json:"paused"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	account, err := s.Q.AccountInShop(ctx, store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
	if err != nil {
		return err
	}
	if err := s.Q.SetRemindersPaused(ctx, store.SetRemindersPausedParams{ID: account.ID, RemindersPaused: in.Paused}); err != nil {
		return err
	}
	if in.Paused {
		return notice(c, "Reminders paused for "+account.CustomerName+".", nil)
	}
	return notice(c, "Reminders back on for "+account.CustomerName+".", nil)
}

func (s *Server) reminderSettings(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	allowed, err := s.planAllows(c.Request().Context(), s.Q, o.Shop.ID, domain.FeatureAutomaticReminders)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{
		"enabled": o.Shop.RemindersEnabled, "every_days": o.Shop.ReminderEveryDays, "hour": o.Shop.ReminderHour,
		"every_days_options": domain.ReminderEveryDays, "first_hour": domain.FirstReminderHour, "last_hour": domain.LastReminderHour,
		"credit_due_days": o.Shop.CreditDueDays, "plan_allows": allowed,
	})
}

func (s *Server) updateReminderSettings(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.ReminderSettingsInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	if in.Enabled {
		if err := s.requireFeature(ctx, o.Shop.ID, domain.FeatureAutomaticReminders); err != nil {
			return err
		}
	}
	if err := domain.UpdateReminderSettings(ctx, s.Q, o.Shop.ID, in); err != nil {
		return err
	}
	return notice(c, "Reminder settings saved.", nil)
}

// setMyReminders is a customer turning reminders off (or on) for themselves.
func (s *Server) setMyReminders(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	var in struct {
		OptOut bool `json:"opt_out"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	if err := s.Q.SetRemindersOptOut(c.Request().Context(), store.SetRemindersOptOutParams{ID: cur.User.ID, RemindersOptOut: in.OptOut}); err != nil {
		return err
	}
	if in.OptOut {
		return notice(c, "Payment reminders turned off. Shops can still message you themselves.", nil)
	}
	return notice(c, "Payment reminders turned on.", nil)
}
