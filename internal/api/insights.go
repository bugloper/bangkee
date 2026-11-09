package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
)

// Insights is the owner's view of the book over time: credit given and money
// back, month by month, and who owes what now.

// thimphu is Bhutan's clock: UTC+6 all year. A month on the chart is a month
// as the shop lived it.
var thimphu = domain.Thimphu

// insightMonths is how far back the chart reaches, this month included.
const insightMonths = 6

func (s *Server) insights(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	now := time.Now().In(thimphu)
	current := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, thimphu)
	first := current.AddDate(0, -(insightMonths - 1), 0)

	// The month whose entries are listed: this one unless another is asked for.
	month := current
	if asked := c.QueryParam("month"); asked != "" {
		parsed, err := time.ParseInLocation("2006-01", asked, thimphu)
		if err != nil || parsed.Before(first) || parsed.After(current) {
			return apperr.NewRule("Choose one of the last six months.")
		}
		month = parsed
	}

	totals, err := s.Q.MonthlyTotals(ctx, store.MonthlyTotalsParams{ShopID: o.Shop.ID, Since: first})
	if err != nil {
		return err
	}
	byMonth := map[string]store.MonthlyTotalsRow{}
	for _, row := range totals {
		byMonth[row.Month] = row
	}
	joined, err := s.Q.MonthlyNewCustomers(ctx, store.MonthlyNewCustomersParams{ShopID: o.Shop.ID, Since: first})
	if err != nil {
		return err
	}
	joinedBy := map[string]int64{}
	for _, row := range joined {
		joinedBy[row.Month] = row.Customers
	}
	sold, err := s.Q.MonthlySales(ctx, store.MonthlySalesParams{ShopID: o.Shop.ID, Since: first})
	if err != nil {
		return err
	}
	salesBy := map[string]store.MonthlySalesRow{}
	for _, row := range sold {
		salesBy[row.Month] = row
	}
	counts, err := s.Q.ShopCounts(ctx, o.Shop.ID)
	if err != nil {
		return err
	}
	months := make([]M, 0, insightMonths)
	for m := first; !m.After(current); m = m.AddDate(0, 1, 0) {
		key := m.Format("2006-01")
		months = append(months, M{
			"month": key, "label": m.Format("Jan"),
			"credit_cents": byMonth[key].CreditCents, "payment_cents": byMonth[key].PaymentCents, "new_customers": joinedBy[key],
			"sales_cents": salesBy[key].Cents, "sales_count": salesBy[key].Sales,
		})
	}

	monthSales, err := domain.SalesBetween(ctx, s.Q, o.Shop.ID, month, month.AddDate(0, 1, 0))
	if err != nil {
		return err
	}
	rows, err := s.Q.ShopTransactionsBetween(ctx, store.ShopTransactionsBetweenParams{ShopID: o.Shop.ID, Since: month, Until: month.AddDate(0, 1, 0)})
	if err != nil {
		return err
	}
	entries := make([]domain.Entry, len(rows))
	for i, row := range rows {
		entries[i] = domain.Entry{Transaction: row.Transaction, CreatedByName: row.CreatedByName}
	}
	views, err := domain.Entries(ctx, s.Q, entries)
	if err != nil {
		return err
	}
	listed := make([]M, 0, len(views))
	for i, view := range views {
		listed = append(listed, withField(view, "account", M{"id": rows[i].Transaction.AccountID, "display_name": rows[i].AccountName}))
	}

	owing, err := s.Q.OwingAccounts(ctx, o.Shop.ID)
	if err != nil {
		return err
	}
	var outstanding int64
	overdue := 0
	owingViews := make([]domain.AccountSummary, 0, len(owing))
	for _, a := range owing {
		view := domain.AccountView(a, o.Shop.CreditDueDays)
		outstanding += a.BalanceCents
		if view.Overdue {
			overdue++
		}
		owingViews = append(owingViews, view)
	}

	return c.JSON(http.StatusOK, M{
		"months": months, "month": month.Format("2006-01"), "entries": listed, "sales": monthSales,
		"outstanding_cents": outstanding, "owing": owingViews, "overdue_count": overdue, "customers_count": counts.Customers,
	})
}
