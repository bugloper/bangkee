package api

import (
	"context"
	"log/slog"
	"time"

	"bangkee/internal/store"
)

// ScheduleOverdueReminders runs daily at 8am Asia/Thimphu (UTC+6, no daylight
// saving) — 02:00 UTC. One reminder per overdue account per run.
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
