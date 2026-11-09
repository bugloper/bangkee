package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/domain"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// The operator console's overview and shop list. Every shop's subscription
// is read once and counted in Go, so neither screen asks the database once
// per shop.

// consoleMonths is how far back the console's chart reaches, this month included.
const consoleMonths = 12

func (s *Server) adminDashboard(c *echo.Context) error {
	if _, err := s.admin(c); err != nil {
		return err
	}
	ctx := c.Request().Context()
	now := time.Now()
	local := now.In(domain.Thimphu)
	thisMonth := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, domain.Thimphu)
	first := thisMonth.AddDate(0, -(consoleMonths - 1), 0)

	revenue, err := s.Q.MonthlyApproved(ctx, first)
	if err != nil {
		return err
	}
	newShops, err := s.Q.MonthlyNewShops(ctx, first)
	if err != nil {
		return err
	}
	revenueBy, shopsBy := map[string]int64{}, map[string]int64{}
	for _, r := range revenue {
		revenueBy[r.Month] = r.Cents
	}
	for _, r := range newShops {
		shopsBy[r.Month] = r.Shops
	}
	months := make([]M, 0, consoleMonths)
	for m := first; !m.After(thisMonth); m = m.AddDate(0, 1, 0) {
		key := m.Format("2006-01")
		months = append(months, M{"month": key, "label": m.Format("Jan"), "approved_cents": revenueBy[key], "new_shops": shopsBy[key]})
	}
	thisKey, lastKey := thisMonth.Format("2006-01"), thisMonth.AddDate(0, -1, 0).Format("2006-01")

	subs, err := s.Q.AllSubscriptions(ctx)
	if err != nil {
		return err
	}
	mix := M{"trialing": 0, "basic": 0, "pro": 0, "business": 0, "past_due": 0, "disabled": 0}
	paying := 0
	for _, sub := range subs {
		switch status := domain.EffectiveStatus(sub, now); status {
		case domain.Trialing:
			mix["trialing"] = mix["trialing"].(int) + 1
		case domain.Active:
			mix[sub.Plan] = mix[sub.Plan].(int) + 1
			paying++
		case domain.PastDue:
			mix["past_due"] = mix["past_due"].(int) + 1
		default:
			mix["disabled"] = mix["disabled"].(int) + 1
		}
	}

	pendingStatus := int32(0)
	rows, err := s.Q.SubscriptionPaymentList(ctx, store.SubscriptionPaymentListParams{Status: &pendingStatus, OldestFirst: true, RowLimit: 5})
	if err != nil {
		return err
	}
	pending, err := s.adminPaymentViews(ctx, rows)
	if err != nil {
		return err
	}
	count, err := s.Q.PendingSubscriptionPaymentCount(ctx)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{
		"approved_month_cents": revenueBy[thisKey], "approved_last_month_cents": revenueBy[lastKey],
		"new_shops_month": shopsBy[thisKey], "new_shops_last_month": shopsBy[lastKey],
		"shops_count": len(subs), "paying_count": paying, "trialing_count": mix["trialing"],
		"locked_count": mix["disabled"], "pending_count": count, "pending": pending,
		"plan_mix": mix, "months": months,
	})
}

func (s *Server) adminShops(c *echo.Context) error {
	if _, err := s.admin(c); err != nil {
		return err
	}
	ctx := c.Request().Context()
	shops, err := s.Q.AdminShops(ctx)
	if err != nil {
		return err
	}
	subs, err := s.Q.AllSubscriptions(ctx)
	if err != nil {
		return err
	}
	subOf := map[int64]store.Subscription{}
	for _, sub := range subs {
		subOf[sub.ShopID] = sub
	}
	out := make([]M, 0, len(shops))
	for _, shop := range shops {
		var view *domain.SubscriptionDTO
		if sub, ok := subOf[shop.ID]; ok {
			view = util.Ptr(domain.SubscriptionView(sub))
		}
		out = append(out, M{
			"id": shop.ID, "name": shop.Name, "kind": shop.Kind, "kind_label": domain.ShopKindLabel(shop.Kind), "created_at": shop.CreatedAt,
			"owner_name": shop.OwnerName, "owner_email": shop.OwnerEmail, "customers": shop.Customers, "subscription": view,
		})
	}
	return c.JSON(http.StatusOK, M{"shops": out})
}
