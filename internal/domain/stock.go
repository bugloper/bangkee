package domain

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"bangkee/internal/apperr"
	"bangkee/internal/money"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Inventory: an item may keep a count of what is on the shelf, in whole
// units. Itemized credits and sales picked from the shop's items take from
// it, crossing them out puts it back, restocking adds to it, and a recount
// corrects it. Every change is logged in stock_movements. An item that is
// not counted (stock NULL) carries on as before.

const (
	StockStarted          = "started"
	StockRestock          = "restock"
	StockCorrection       = "correction"
	StockCredit           = "credit"
	StockSale             = "sale"
	StockCreditCrossedOut = "credit_crossed_out"
	StockSaleCrossedOut   = "sale_crossed_out"
)

// DefaultLowStock is when customers read "Only 3 left" on an item whose
// shop set no warning level of its own.
const DefaultLowStock = 5

// LowStock is an item a change just took to its warning level or under.
type LowStock struct {
	ItemID int64
	Name   string
	Left   int32
}

// LowLevel is the count at or under which an item is running low.
func LowLevel(lowStockAt *int32) int32 {
	if lowStockAt != nil {
		return *lowStockAt
	}
	return DefaultLowStock
}

// SoldOut: a counted item with nothing left.
func SoldOut(item store.MenuItem) bool { return item.Stock != nil && *item.Stock <= 0 }

// stockRef says what a change to the count came from.
type stockRef struct {
	reason        string
	transactionID *int64
	saleID        *int64
	unitCost      *int64
	notes         *string
}

// moveStock changes a counted item's count by change and logs it. Nothing
// happens for an item that is not counted. It reports the item when a fall
// takes it to its warning level, or to nothing, from above.
func moveStock(ctx context.Context, q *store.Queries, itemID int64, change int32, by int64, ref stockRef) (*LowStock, error) {
	row, err := q.MoveStock(ctx, store.MoveStockParams{ID: itemID, Change: change})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	err = q.InsertStockMovement(ctx, store.InsertStockMovementParams{
		MenuItemID: itemID, Change: change, StockAfter: row.Stock, Reason: ref.reason, UnitCostCents: ref.unitCost,
		TransactionID: ref.transactionID, SaleID: ref.saleID, Notes: ref.notes, CreatedByID: by,
	})
	if err != nil || change >= 0 {
		return nil, err
	}
	before := row.Stock - change
	if (row.LowStockAt != nil && before > *row.LowStockAt && row.Stock <= *row.LowStockAt) || (before > 0 && row.Stock <= 0) {
		return &LowStock{ItemID: row.ID, Name: row.Name, Left: row.Stock}, nil
	}
	return nil, nil
}

// ------------------------------------------------- lines that name an item

// itemLink checks a picked line's item: it must be the shop's, and an item
// that is counted is sold in whole units. An item since removed from the
// list leaves the line as typed, so a sale queued offline still records.
func itemLink(ctx context.Context, q *store.Queries, shopID int64, itemID *int64, name string, quantity decimal.Decimal, errs *apperr.Errors) (*int64, error) {
	if itemID == nil || *itemID == 0 || shopID == 0 {
		return nil, nil
	}
	item, err := q.MenuItemInShop(ctx, store.MenuItemInShopParams{ShopID: shopID, ID: *itemID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if item.Stock != nil && !quantity.IsInteger() {
		errs.Add(name + " is counted in whole units: put details such as 2.5 kg in the note")
	}
	return &item.ID, nil
}

// takeStock takes what a credit or sale sold off its items' counts.
func takeStock(ctx context.Context, q *store.Queries, by int64, ref stockRef, lines []line) ([]LowStock, error) {
	var low []LowStock
	for _, l := range lines {
		if l.itemID == nil || !l.quantity.IsInteger() {
			continue
		}
		hit, err := moveStock(ctx, q, *l.itemID, -int32(l.quantity.IntPart()), by, ref)
		if err != nil {
			return nil, err
		}
		if hit != nil {
			low = append(low, *hit)
		}
	}
	return low, nil
}

type taken struct {
	itemID int64
	count  int32
}

// putBack returns to the shelf what a crossed-out credit or sale took.
func putBack(ctx context.Context, q *store.Queries, by int64, ref stockRef, rows []taken) error {
	for _, row := range rows {
		if row.count == 0 {
			continue
		}
		if _, err := moveStock(ctx, q, row.itemID, row.count, by, ref); err != nil {
			return err
		}
	}
	return nil
}

func putBackEntry(ctx context.Context, q *store.Queries, transactionID, by int64) error {
	rows, err := q.StockTakenByEntry(ctx, &transactionID)
	if err != nil {
		return err
	}
	back := make([]taken, len(rows))
	for i, row := range rows {
		back[i] = taken{row.MenuItemID, row.Taken}
	}
	return putBack(ctx, q, by, stockRef{reason: StockCreditCrossedOut, transactionID: &transactionID}, back)
}

func putBackSale(ctx context.Context, q *store.Queries, saleID, by int64) error {
	rows, err := q.StockTakenBySale(ctx, &saleID)
	if err != nil {
		return err
	}
	back := make([]taken, len(rows))
	for i, row := range rows {
		back[i] = taken{row.MenuItemID, row.Taken}
	}
	return putBack(ctx, q, by, stockRef{reason: StockSaleCrossedOut, saleID: &saleID}, back)
}

// ---------------------------------------------------- the owner's controls

// wholeCount reads a count typed by the owner: a whole number, 0 or more.
func wholeCount(label, value string, errs *apperr.Errors) int32 {
	n, err := strconv.ParseInt(strings.TrimSpace(value), 10, 32)
	switch {
	case !util.Present(value):
		errs.Add(label + " can't be blank")
	case err != nil:
		errs.Add(label + " must be a whole number")
	case n < 0:
		errs.Add(label + " must be 0 or more")
	}
	return int32(n)
}

// optionalCost reads a buying price; blank is none.
func optionalCost(value string, errs *apperr.Errors) *int64 {
	if !util.Present(value) {
		return nil
	}
	cents, ok := money.ParseCents(value)
	switch {
	case !ok:
		errs.Add("Buying price is not a number")
	case cents < 0:
		errs.Add("Buying price must be 0 or more")
	}
	return &cents
}

// StockSettings are the item form's counting fields. Stock is the count to
// start from when counting begins; once counted, the count changes only by
// restocking, a recount, credits and sales.
type StockSettings struct {
	Count      bool   `json:"count"`
	Stock      string `json:"stock"`
	LowStockAt string `json:"low_stock_at"`
	Cost       string `json:"cost"`
}

func saveStockSettings(ctx context.Context, q *store.Queries, item store.MenuItem, in StockSettings, by int64) error {
	var errs apperr.Errors
	cost := optionalCost(in.Cost, &errs)
	if !in.Count {
		if err := errs.Err(); err != nil {
			return err
		}
		return q.SetStockSettings(ctx, store.SetStockSettingsParams{ID: item.ID, Stock: nil, LowStockAt: nil, CostCents: cost})
	}
	var low *int32
	if util.Present(in.LowStockAt) {
		n := wholeCount("Warn me at", in.LowStockAt, &errs)
		low = &n
	}
	stock, starting := item.Stock, item.Stock == nil
	if starting {
		n := wholeCount("In stock now", in.Stock, &errs)
		stock = &n
	}
	if err := errs.Err(); err != nil {
		return err
	}
	if err := q.SetStockSettings(ctx, store.SetStockSettingsParams{ID: item.ID, Stock: stock, LowStockAt: low, CostCents: cost}); err != nil {
		return err
	}
	if !starting {
		return nil
	}
	return q.InsertStockMovement(ctx, store.InsertStockMovementParams{
		MenuItemID: item.ID, Change: *stock, StockAfter: *stock, Reason: StockStarted, UnitCostCents: cost, CreatedByID: by,
	})
}

type RestockInput struct {
	Quantity string `json:"quantity"`
	Cost     string `json:"cost"`
	Notes    string `json:"notes"`
}

// Restock adds what came in. A buying price becomes the item's.
func Restock(ctx context.Context, q *store.Queries, shopID, itemID, by int64, in RestockInput) (store.MenuItem, error) {
	item, err := q.MenuItemForUpdate(ctx, store.MenuItemForUpdateParams{ShopID: shopID, ID: itemID})
	if err != nil {
		return item, err
	}
	var errs apperr.Errors
	if item.Stock == nil {
		errs.Add(item.Name + " is not counted. Turn on counting stock for it first")
	}
	n := wholeCount("Quantity", in.Quantity, &errs)
	errs.Check(n > 0 || !util.Present(in.Quantity), "Quantity must be greater than 0")
	cost := optionalCost(in.Cost, &errs)
	if err := errs.Err(); err != nil {
		return item, err
	}
	if cost != nil {
		if err := q.SetItemCost(ctx, store.SetItemCostParams{ID: item.ID, CostCents: cost}); err != nil {
			return item, err
		}
	}
	_, err = moveStock(ctx, q, item.ID, n, by, stockRef{reason: StockRestock, unitCost: cost, notes: util.Presence(in.Notes)})
	return item, err
}

type RecountInput struct {
	Counted string `json:"counted"`
	Notes   string `json:"notes"`
}

// Recount sets the count to what is actually on the shelf. It reports the
// item when the correction takes it to its warning level or under.
func Recount(ctx context.Context, q *store.Queries, shopID, itemID, by int64, in RecountInput) (store.MenuItem, *LowStock, error) {
	item, err := q.MenuItemForUpdate(ctx, store.MenuItemForUpdateParams{ShopID: shopID, ID: itemID})
	if err != nil {
		return item, nil, err
	}
	var errs apperr.Errors
	if item.Stock == nil {
		errs.Add(item.Name + " is not counted. Turn on counting stock for it first")
	}
	counted := wholeCount("Counted", in.Counted, &errs)
	if err := errs.Err(); err != nil {
		return item, nil, err
	}
	change := counted - *item.Stock
	if change == 0 {
		return item, nil, apperr.NewRule("That is already the count.")
	}
	low, err := moveStock(ctx, q, item.ID, change, by, stockRef{reason: StockCorrection, notes: util.Presence(in.Notes)})
	return item, low, err
}

// ------------------------------------------------------------------ views

type StockMovementDTO struct {
	ID            int64     `json:"id"`
	Change        int32     `json:"change"`
	StockAfter    int32     `json:"stock_after"`
	Reason        string    `json:"reason"`
	UnitCostCents *int64    `json:"unit_cost_cents"`
	TransactionID *int64    `json:"transaction_id"`
	SaleID        *int64    `json:"sale_id"`
	Notes         *string   `json:"notes"`
	By            string    `json:"by"`
	At            time.Time `json:"at"`
}

func StockHistory(ctx context.Context, q *store.Queries, itemID int64) ([]StockMovementDTO, error) {
	rows, err := q.StockMovements(ctx, itemID)
	if err != nil {
		return nil, err
	}
	out := make([]StockMovementDTO, len(rows))
	for i, r := range rows {
		out[i] = StockMovementDTO{ID: r.ID, Change: r.Change, StockAfter: r.StockAfter, Reason: r.Reason, UnitCostCents: r.UnitCostCents,
			TransactionID: r.TransactionID, SaleID: r.SaleID, Notes: r.Notes, By: r.ByName, At: r.CreatedAt}
	}
	return out, nil
}

// StockValueCents is what the counted stock on the shelf cost to buy, for
// the items with a buying price.
func StockValueCents(items []store.MenuItem) int64 {
	var total int64
	for _, item := range items {
		if item.Stock != nil && *item.Stock > 0 && item.CostCents != nil {
			total += int64(*item.Stock) * *item.CostCents
		}
	}
	return total
}
