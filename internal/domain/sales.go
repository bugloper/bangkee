package domain

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/money"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Sales paid on the spot: the shop's record of what it takes at the counter
// besides credit. A sale touches no balance and no customer sees it, so it is
// recorded, listed and crossed out by the shop alone — on every plan. It can
// name a customer for the shop's own reference. An itemized sale's lines are
// its amount, as with an itemized credit.

const SaleRecordType = "Sale"

// SaleMethods are how a sale is paid, in the order the form offers them.
var SaleMethods = []string{"Mobile transfer", "Cash", "Other"}

type SaleInput struct {
	Amount         string      `json:"amount"`
	PaymentMethod  string      `json:"payment_method"`
	Description    string      `json:"description"`
	Itemized       bool        `json:"itemized"`
	LineItems      []LineInput `json:"line_items"`
	AccountID      *int64      `json:"account_id"`
	OccurredAt     string      `json:"occurred_at"`
	IdempotencyKey string      `json:"idempotency_key"`
}

// RecordSale records a sale for the shop. Duplicate: the offline queue replayed
// one already recorded, and nothing changed.
func RecordSale(ctx context.Context, q *store.Queries, shopID, by int64, in SaleInput, now time.Time) (id int64, amount int64, duplicate bool, err error) {
	var errs apperr.Errors
	var lines []line
	if in.Itemized {
		lines = linesFrom(in.LineItems, &errs)
		errs.Check(len(lines) > 0, "Add at least one item")
	}
	amount, amountOK := money.ParseCents(in.Amount)
	if in.Itemized && len(lines) > 0 {
		amount, amountOK = 0, true
		for _, l := range lines {
			amount += money.LineTotal(l.quantity, l.unitPrice)
		}
	}
	errs.Check(amountOK && amount > 0, "Amount must be greater than 0")
	errs.Check(slices.Contains(SaleMethods, in.PaymentMethod), "Choose how they paid: mobile transfer, cash or other")
	occurredAt, timeOK := util.ParseTime(in.OccurredAt)
	errs.Check(timeOK, "Occurred at is not a valid date")
	if err := errs.Err(); err != nil {
		return 0, 0, false, err
	}
	at := now
	if occurredAt != nil {
		at = *occurredAt
	}
	if in.AccountID != nil {
		// Only one of this shop's own customers can be named on its sale.
		if _, err := q.AccountInShop(ctx, store.AccountInShopParams{ID: *in.AccountID, ShopID: shopID}); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return 0, 0, false, apperr.NewRule("That customer is not in your book.")
			}
			return 0, 0, false, err
		}
	}
	id, err = q.InsertSale(ctx, store.InsertSaleParams{
		ShopID: shopID, AccountID: in.AccountID, CreatedByID: by, AmountCents: amount, PaymentMethod: in.PaymentMethod,
		Description: util.Presence(in.Description), Itemized: in.Itemized, OccurredAt: at, IdempotencyKey: util.Presence(in.IdempotencyKey),
	})
	if err != nil {
		return 0, 0, false, err
	}
	if id == 0 {
		return 0, amount, true, nil
	}
	for _, l := range lines {
		if err := q.InsertSaleItem(ctx, store.InsertSaleItemParams{SaleID: id, Name: l.name, Quantity: l.quantity, UnitPriceCents: l.unitPrice}); err != nil {
			return 0, 0, false, err
		}
	}
	return id, amount, false, Audit(ctx, q, SaleRecordType, id, "recorded", &by, map[string]any{"amount_cents": amount, "payment_method": in.PaymentMethod})
}

// CrossOutSale takes a sale out of the takings; it stays on the record.
func CrossOutSale(ctx context.Context, q *store.Queries, sale store.Sale, by int64) error {
	crossed, err := q.CrossOutSale(ctx, store.CrossOutSaleParams{ID: sale.ID, CrossedOutByID: &by})
	if err != nil {
		return err
	}
	if crossed == 0 {
		return apperr.NewRule("That sale was already crossed out.")
	}
	return Audit(ctx, q, SaleRecordType, sale.ID, "crossed_out", &by, map[string]any{"amount_cents": sale.AmountCents})
}

type SaleItemDTO struct {
	Name           string `json:"name"`
	Quantity       string `json:"quantity"`
	UnitPriceCents int64  `json:"unit_price_cents"`
}

type SaleDTO struct {
	ID            int64         `json:"id"`
	AmountCents   int64         `json:"amount_cents"`
	PaymentMethod string        `json:"payment_method"`
	Description   *string       `json:"description"`
	Items         []SaleItemDTO `json:"items"`
	AccountID     *int64        `json:"account_id"`
	CustomerName  *string       `json:"customer_name"`
	CreatedByName string        `json:"created_by_name"`
	OccurredAt    time.Time     `json:"occurred_at"`
	CrossedOut    bool          `json:"crossed_out"`
}

type MethodTotal struct {
	Method string `json:"method"`
	Cents  int64  `json:"cents"`
	Sales  int64  `json:"sales"`
}

// SalesDay is one Thimphu day at the counter: its sales, and its takings —
// sales by how they were paid, and what was collected on credit.
type SalesDay struct {
	Day            string        `json:"day"`
	PreviousDay    string        `json:"previous_day"`
	NextDay        *string       `json:"next_day"`
	Sales          []SaleDTO     `json:"sales"`
	SalesCents     int64         `json:"sales_cents"`
	SalesCount     int64         `json:"sales_count"`
	ByMethod       []MethodTotal `json:"by_method"`
	CollectedCents int64         `json:"collected_cents"`
	CreditCents    int64         `json:"credit_cents"`
	TakingsCents   int64         `json:"takings_cents"`
}

// ThimphuDay is the day named "2006-01-02" in Thimphu, or today there when
// the name is empty or malformed.
func ThimphuDay(name string, now time.Time) time.Time {
	if d, err := time.ParseInLocation("2006-01-02", name, Thimphu); err == nil {
		return d
	}
	local := now.In(Thimphu)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, Thimphu)
}

func SalesForDay(ctx context.Context, q *store.Queries, shopID int64, day, now time.Time) (SalesDay, error) {
	next := day.AddDate(0, 0, 1)
	out := SalesDay{Day: day.Format("2006-01-02"), PreviousDay: day.AddDate(0, 0, -1).Format("2006-01-02"), Sales: []SaleDTO{}, ByMethod: []MethodTotal{}}
	if next.Before(now) {
		n := next.Format("2006-01-02")
		out.NextDay = &n
	}
	rows, err := q.SalesBetween(ctx, store.SalesBetweenParams{ShopID: shopID, FromTime: day, ToTime: next})
	if err != nil {
		return out, err
	}
	ids := make([]int64, 0, len(rows))
	for _, r := range rows {
		if r.Sale.Itemized {
			ids = append(ids, r.Sale.ID)
		}
	}
	items := map[int64][]SaleItemDTO{}
	if len(ids) > 0 {
		found, err := q.SaleItemsFor(ctx, ids)
		if err != nil {
			return out, err
		}
		for _, it := range found {
			items[it.SaleID] = append(items[it.SaleID], SaleItemDTO{Name: it.Name, Quantity: it.Quantity.String(), UnitPriceCents: it.UnitPriceCents})
		}
	}
	for _, r := range rows {
		s := r.Sale
		out.Sales = append(out.Sales, SaleDTO{
			ID: s.ID, AmountCents: s.AmountCents, PaymentMethod: s.PaymentMethod, Description: s.Description, Items: append([]SaleItemDTO{}, items[s.ID]...),
			AccountID: s.AccountID, CustomerName: r.CustomerName, CreatedByName: r.CreatedByName, OccurredAt: s.OccurredAt, CrossedOut: s.CrossedOutAt != nil,
		})
	}
	byMethod, err := q.SalesByMethod(ctx, store.SalesByMethodParams{ShopID: shopID, FromTime: day, ToTime: next})
	if err != nil {
		return out, err
	}
	for _, method := range SaleMethods {
		for _, m := range byMethod {
			if m.PaymentMethod == method {
				out.ByMethod = append(out.ByMethod, MethodTotal{Method: method, Cents: m.Cents, Sales: m.Sales})
				out.SalesCents += m.Cents
				out.SalesCount += m.Sales
			}
		}
	}
	if out.CollectedCents, err = q.CollectedBetween(ctx, store.CollectedBetweenParams{ShopID: shopID, FromTime: day, ToTime: next}); err != nil {
		return out, err
	}
	daily, err := q.DailyTotals(ctx, store.DailyTotalsParams{ShopID: shopID, Since: day})
	if err != nil {
		return out, err
	}
	for _, d := range daily {
		if d.Day == out.Day {
			out.CreditCents = d.CreditCents
		}
	}
	out.TakingsCents = out.SalesCents + out.CollectedCents
	return out, nil
}
