package api

import (
	"context"
	"log/slog"
	"time"

	"bangkee/internal/domain"
	"bangkee/internal/store"
)

// ScheduleOverdueReminders runs daily at 8am Asia/Thimphu (UTC+6, no daylight
// saving) — 02:00 UTC. One reminder per overdue account per run, and a note
// to each owner whose free trial is about to end.
func (s *Server) ScheduleOverdueReminders(ctx context.Context) {
	go func() {
		for {
			now := time.Now().UTC()
			next := time.Date(now.Year(), now.Month(), now.Day(), 2, 0, 0, 0, time.UTC)
			if !next.After(now) {
				next = next.Add(24 * time.Hour)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Until(next)):
			}
			if err := s.OverdueReminders(ctx); err != nil {
				slog.Error("overdue reminders failed", "error", err)
			}
			if err := s.TrialEndingReminders(ctx); err != nil {
				slog.Error("trial reminders failed", "error", err)
			}
		}
	}()
}

func (s *Server) OverdueReminders(ctx context.Context) error {
	shops, err := s.Q.AllShops(ctx)
	if err != nil {
		return err
	}
	for _, shop := range shops {
		overdue, err := s.Q.OverdueAccounts(ctx, store.OverdueAccountsParams{
			ShopID: shop.ID, Threshold: time.Now().AddDate(0, 0, -int(shop.CreditDueDays)),
		})
		if err != nil {
			return err
		}
		for _, account := range overdue {
			s.Notify.OverdueReminder(ctx, account.ID, shop.CreditDueDays)
		}
	}
	return nil
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
