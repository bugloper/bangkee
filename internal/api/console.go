package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/domain"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// The operator console's overview and shop list. Every shop's subscription
// is read once and counted in Go, so neither screen asks the database once
// per shop.

// The periods the overview can show, in days.
var consolePeriods = map[string]int{"7": 7, "30": 30, "90": 90}

// series fills a day-by-day series from rows keyed "YYYY-MM-DD", with a zero
// for every day nothing happened.
func series(from time.Time, days int, value func(day string) int64) []M {
	out := make([]M, 0, days)
	for i := 0; i < days; i++ {
		day := from.AddDate(0, 0, i).Format("2006-01-02")
		out = append(out, M{"day": day, "value": value(day)})
	}
	return out
}

func sumBetween(by map[string]int64, from time.Time, days int) int64 {
	var total int64
	for i := 0; i < days; i++ {
		total += by[from.AddDate(0, 0, i).Format("2006-01-02")]
	}
	return total
}

// adminDashboard is the console's overview for the last 7, 30 or 90 days,
// each figure beside the same figure for the period before.
func (s *Server) adminDashboard(c *echo.Context) error {
	if _, err := s.admin(c); err != nil {
		return err
	}
	days, ok := consolePeriods[c.QueryParam("days")]
	if !ok {
		days = 30
	}
	ctx := c.Request().Context()
	now := time.Now()
	local := now.In(domain.Thimphu)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, domain.Thimphu)
	from := today.AddDate(0, 0, -(days - 1)) // this period, today included
	before := from.AddDate(0, 0, -days)      // the period before it

	approvedRows, err := s.Q.DailyApproved(ctx, before)
	if err != nil {
		return err
	}
	shopRows, err := s.Q.DailyNewShops(ctx, before)
	if err != nil {
		return err
	}
	activityRows, err := s.Q.DailyPlatformActivity(ctx, before)
	if err != nil {
		return err
	}
	approved, newShops, credits, payments, activeByDay := map[string]int64{}, map[string]int64{}, map[string]int64{}, map[string]int64{}, map[string]int64{}
	for _, r := range approvedRows {
		approved[r.Day] = r.Cents
	}
	for _, r := range shopRows {
		newShops[r.Day] = r.Shops
	}
	for _, r := range activityRows {
		credits[r.Day], payments[r.Day], activeByDay[r.Day] = r.Credits, r.Payments, r.Shops
	}
	activeNow, err := s.Q.ActiveShopsBetween(ctx, store.ActiveShopsBetweenParams{Since: from, Until: now.Add(time.Minute)})
	if err != nil {
		return err
	}
	activeBefore, err := s.Q.ActiveShopsBetween(ctx, store.ActiveShopsBetweenParams{Since: before, Until: from})
	if err != nil {
		return err
	}

	// Subscriptions: where every shop stands, and what the paying ones bring in a month.
	subs, err := s.Q.AllSubscriptions(ctx)
	if err != nil {
		return err
	}
	names, err := s.Q.AdminShops(ctx)
	if err != nil {
		return err
	}
	nameOf := map[int64]string{}
	for _, shop := range names {
		nameOf[shop.ID] = shop.Name
	}
	mix := map[string]int64{"trialing": 0, "basic": 0, "pro": 0, "business": 0, "past_due": 0, "disabled": 0}
	mrrByPlan := map[string]int64{"basic": 0, "pro": 0, "business": 0}
	var mrr int64
	trialsEnding, paymentDue := []M{}, []M{}
	soon := now.AddDate(0, 0, 14)
	for _, sub := range subs {
		switch domain.EffectiveStatus(sub, now) {
		case domain.Trialing:
			mix["trialing"]++
			if sub.CurrentPeriodEnd.Before(soon) {
				trialsEnding = append(trialsEnding, M{"shop_id": sub.ShopID, "name": nameOf[sub.ShopID], "ends_at": sub.CurrentPeriodEnd, "days_left": domain.DaysRemaining(sub)})
			}
		case domain.Active:
			mix[sub.Plan]++
			mrr += sub.PriceCents
			mrrByPlan[sub.Plan] += sub.PriceCents
		case domain.PastDue:
			mix["past_due"]++
			paymentDue = append(paymentDue, M{"shop_id": sub.ShopID, "name": nameOf[sub.ShopID], "grace_until": sub.GraceUntil, "days_left": domain.GraceDaysRemaining(sub)})
		default:
			mix["disabled"]++
		}
	}

	sort.Slice(trialsEnding, func(i, j int) bool {
		return trialsEnding[i]["ends_at"].(time.Time).Before(trialsEnding[j]["ends_at"].(time.Time))
	})

	active, err := s.Q.MostActiveShops(ctx, from)
	if err != nil {
		return err
	}
	activeViews := make([]M, 0, len(active))
	for _, a := range active {
		activeViews = append(activeViews, M{"id": a.ID, "name": a.Name, "kind_label": domain.ShopKindLabel(a.Kind), "entries": a.Entries, "customers": a.Customers, "last_entry_at": a.LastEntryAt})
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
	pendingCount, err := s.Q.PendingSubscriptionPaymentCount(ctx)
	if err != nil {
		return err
	}

	figure := func(by map[string]int64) M {
		return M{"value": sumBetween(by, from, days), "previous": sumBetween(by, before, days), "series": series(from, days, func(d string) int64 { return by[d] })}
	}
	return c.JSON(http.StatusOK, M{
		"days": days, "from": from, "shops_count": len(subs),
		"approved":     figure(approved),
		"new_shops":    figure(newShops),
		"active_shops": M{"value": activeNow, "previous": activeBefore, "series": series(from, days, func(d string) int64 { return activeByDay[d] })},
		"entries":      M{"value": sumBetween(credits, from, days) + sumBetween(payments, from, days), "previous": sumBetween(credits, before, days) + sumBetween(payments, before, days)},
		"mrr_cents":    mrr, "mrr_by_plan": mrrByPlan, "plan_mix": mix,
		"pending_count": pendingCount, "pending": pending,
		"trials_ending": trialsEnding, "payment_due": paymentDue, "most_active": activeViews,
		"activity_days": activityDays(from, days, credits, payments),
	})
}

// activityDays is each day's credits and payments recorded across every shop.
func activityDays(from time.Time, days int, credits, payments map[string]int64) []M {
	out := make([]M, 0, days)
	for i := 0; i < days; i++ {
		day := from.AddDate(0, 0, i).Format("2006-01-02")
		out = append(out, M{"day": day, "credits": credits[day], "payments": payments[day]})
	}
	return out
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
