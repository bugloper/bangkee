package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/domain"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// The owner's home: where the book stands now, what happened today, and how
// collecting has gone lately. Every figure comes from the ledger — the
// balances cached on accounts (recomputed from the entries on every write)
// and the entries themselves — so the numbers here are the numbers a
// statement prints.

// trendDays is how far back the collections chart reaches, today included.
const trendDays = 14

// dashboardList is how many customers each list on the dashboard shows.
const dashboardList = 5

// owingTotals is what the accounts that owe the shop add up to. One pass over
// one query: the same rows give the total, the overdue share and both lists.
type owingTotals struct {
	outstanding, overdueCents int64
	owingCount, overdueCount  int
	overdue, top              []store.Account
}

func sumOwing(accounts []store.Account, creditDueDays int32) owingTotals {
	var t owingTotals
	for _, a := range accounts { // balance > 0, largest first
		t.outstanding += a.BalanceCents
		t.owingCount++
		if len(t.top) < dashboardList {
			t.top = append(t.top, a)
		}
		if domain.Overdue(a, creditDueDays) {
			t.overdueCents += a.BalanceCents
			t.overdueCount++
			if len(t.overdue) < dashboardList {
				t.overdue = append(t.overdue, a)
			}
		}
	}
	return t
}

func (s *Server) ownerDashboard(c *echo.Context, shop store.Shop) error {
	ctx, q := c.Request().Context(), s.Q
	now := time.Now().In(thimphu)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, thimphu)
	first := today.AddDate(0, 0, -(trendDays - 1))

	owing, err := q.OwingAccounts(ctx, shop.ID)
	if err != nil {
		return err
	}
	totals := sumOwing(owing, shop.CreditDueDays)

	daily, err := q.DailyTotals(ctx, store.DailyTotalsParams{ShopID: shop.ID, Since: first})
	if err != nil {
		return err
	}
	byDay := map[string]store.DailyTotalsRow{}
	for _, row := range daily {
		byDay[row.Day] = row
	}
	trend := make([]M, 0, trendDays)
	for d := first; !d.After(today); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		trend = append(trend, M{"day": key, "credit_cents": byDay[key].CreditCents, "payment_cents": byDay[key].PaymentCents})
	}
	todayRow := byDay[today.Format("2006-01-02")]

	counts, err := q.ShopCounts(ctx, shop.ID)
	if err != nil {
		return err
	}
	repaid, err := q.RepaidSince(ctx, store.RepaidSinceParams{ShopID: shop.ID, Since: util.MonthStart(time.Now())})
	if err != nil {
		return err
	}

	rows, err := q.RecentShopTransactions(ctx, shop.ID)
	if err != nil {
		return err
	}
	entries := make([]domain.Entry, len(rows))
	accountIDs := make([]int64, len(rows))
	for i, row := range rows {
		entries[i] = domain.Entry{Transaction: row.Transaction, CreatedByName: row.CreatedByName}
		accountIDs[i] = row.Transaction.AccountID
	}
	names, err := q.AccountNames(ctx, accountIDs)
	if err != nil {
		return err
	}
	nameOf := map[int64]string{}
	for _, n := range names {
		nameOf[n.ID] = n.CustomerName
	}
	ledger, err := domain.Entries(ctx, q, entries)
	if err != nil {
		return err
	}
	recent := make([]M, 0, len(ledger))
	for i, entry := range ledger {
		recent = append(recent, withField(entry, "account", M{"id": accountIDs[i], "display_name": nameOf[accountIDs[i]]}))
	}

	// Entries customers have flagged, for the shop to look at.
	disputedRows, err := q.DisputedEntries(ctx, shop.ID)
	if err != nil {
		return err
	}
	disputedEntries := make([]domain.Entry, len(disputedRows))
	for i, row := range disputedRows {
		disputedEntries[i] = domain.Entry{Transaction: row.Transaction, CreatedByName: row.CreatedByName}
	}
	disputedViews, err := domain.Entries(ctx, q, disputedEntries)
	if err != nil {
		return err
	}
	disputed := make([]M, 0, len(disputedViews))
	for i, view := range disputedViews {
		disputed = append(disputed, withField(view, "account", M{"id": disputedRows[i].Transaction.AccountID, "display_name": disputedRows[i].AccountName}))
	}

	late, err := domain.LateInstallmentPlans(ctx, q, shop.ID, time.Now())
	if err != nil {
		return err
	}

	// One photo lookup for both lists.
	photos, err := s.customerPhotos(ctx, append(append([]store.Account{}, totals.overdue...), totals.top...))
	if err != nil {
		return err
	}
	views := func(accounts []store.Account) []domain.AccountSummary {
		out := make([]domain.AccountSummary, 0, len(accounts))
		for _, a := range accounts {
			out = append(out, accountView(a, shop.CreditDueDays, photos))
		}
		return out
	}

	return c.JSON(http.StatusOK, M{
		"kind": "owner", "shop": domain.ShopView(shop),
		"total_outstanding_cents": totals.outstanding, "owing_count": totals.owingCount,
		"overdue_cents": totals.overdueCents, "overdue_count": totals.overdueCount, "overdue_accounts": views(totals.overdue),
		"top_accounts":    views(totals.top),
		"customers_count": counts.Customers, "items_count": counts.MenuItems,
		"credit_today_cents": todayRow.CreditCents, "payments_today_cents": todayRow.PaymentCents,
		"repaid_month_cents": repaid, "trend": trend, "recent_transactions": recent, "disputed": disputed,
		"late_installments": late,
	})
}
