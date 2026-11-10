package domain

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"bangkee/internal/apperr"
	"bangkee/internal/money"
	"bangkee/internal/storage"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Transactions are the entries in the book. A credit adds to what is owed, a
// payment subtracts (BR-9); entries are never deleted, only crossed out, and the
// void is on the record (BR-15/BR-16). Kind is ActiveRecord's enum: credit 0,
// payment 1.

const (
	Credit  int32 = 0
	Payment int32 = 1
)

const (
	TransactionRecordType = "Transaction"
	// ScreenshotName: a payment's photo of the customer's payment screen
	// (mBoB, mPay …), taken at the counter by the shop.
	ScreenshotName = "screenshot"
)

func KindKey(kind int32) string {
	if kind == Credit {
		return "credit"
	}
	return "payment"
}

// Entry is a transaction with the name of whoever recorded it.
type Entry struct {
	store.Transaction
	CreatedByName string
}

func SignedAmount(t store.Transaction) int64 {
	if t.Kind == Credit {
		return t.AmountCents
	}
	return -t.AmountCents
}

type LineItemDTO struct {
	ID             int64  `json:"id"`
	Name           string `json:"name"`
	Quantity       string `json:"quantity"`
	QuantityLabel  string `json:"quantity_label"`
	UnitPriceCents int64  `json:"unit_price_cents"`
	TotalCents     int64  `json:"total_cents"`
}

type LedgerEntry struct {
	ID                  int64         `json:"id"`
	Kind                string        `json:"kind"`
	AmountCents         int64         `json:"amount_cents"`
	SignedAmountCents   int64         `json:"signed_amount_cents"`
	Description         *string       `json:"description"`
	Notes               *string       `json:"notes"`
	PaymentMethod       *string       `json:"payment_method"`
	OccurredAt          time.Time     `json:"occurred_at"`
	Itemized            bool          `json:"itemized"`
	CrossedOut          bool          `json:"crossed_out"`
	CrossedOutAt        *time.Time    `json:"crossed_out_at"`
	CreatedByName       string        `json:"created_by_name"`
	RunningBalanceCents *int64        `json:"running_balance_cents"`
	LineItems           []LineItemDTO `json:"line_items"`
	ScreenshotURL       *string       `json:"screenshot_url"` // a payment's photographed payment screen
	Confirmation        string        `json:"confirmation"`   // pending | confirmed | disputed: the customer's word on it
	Responses           []ResponseDTO `json:"responses"`      // that word's history, oldest first
	Documents           []DocumentDTO `json:"documents"`      // receipts, delivery notes, photos the shop attached
}

func lineItemsFor(ctx context.Context, q *store.Queries, ids []int64) (map[int64][]LineItemDTO, error) {
	rows, err := q.LineItemsFor(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := map[int64][]LineItemDTO{}
	for _, row := range rows {
		out[row.TransactionID] = append(out[row.TransactionID], LineItemDTO{
			ID: row.ID, Name: row.Name, Quantity: row.Quantity.StringFixed(2), QuantityLabel: money.QuantityLabel(row.Quantity),
			UnitPriceCents: row.UnitPriceCents, TotalCents: money.LineTotal(row.Quantity, row.UnitPriceCents),
		})
	}
	return out, nil
}

func entryView(e Entry, running *int64, lines []LineItemDTO, screenshot *string, responses []ResponseDTO, documents []DocumentDTO) LedgerEntry {
	if documents == nil {
		documents = []DocumentDTO{}
	}
	if lines == nil {
		lines = []LineItemDTO{}
	}
	if responses == nil {
		responses = []ResponseDTO{}
	}
	return LedgerEntry{
		ID: e.ID, Kind: KindKey(e.Kind), AmountCents: e.AmountCents, SignedAmountCents: SignedAmount(e.Transaction),
		Description: e.Description, Notes: e.Notes, PaymentMethod: e.PaymentMethod, OccurredAt: e.OccurredAt,
		Itemized: e.Itemized, CrossedOut: e.CrossedOutAt != nil, CrossedOutAt: e.CrossedOutAt, CreatedByName: e.CreatedByName,
		RunningBalanceCents: running, LineItems: lines, ScreenshotURL: screenshot,
		Confirmation: ConfirmationKey(e.Confirmation), Responses: responses, Documents: documents,
	}
}

// Entries turns rows into ledger entries, loading each one's line items.
func Entries(ctx context.Context, q *store.Queries, entries []Entry) ([]LedgerEntry, error) {
	ids := make([]int64, len(entries))
	for i, e := range entries {
		ids[i] = e.ID
	}
	lines, err := lineItemsFor(ctx, q, ids)
	if err != nil {
		return nil, err
	}
	shots, err := AttachmentURLs(ctx, q, TransactionRecordType, ids, ScreenshotName)
	if err != nil {
		return nil, err
	}
	responses, err := responsesFor(ctx, q, ids)
	if err != nil {
		return nil, err
	}
	documents, err := documentsFor(ctx, q, ids)
	if err != nil {
		return nil, err
	}
	out := make([]LedgerEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, entryView(e, nil, lines[e.ID], optionalURL(shots, e.ID), responses[e.ID], documents[e.ID]))
	}
	return out, nil
}

// Ledger is BR-10: chronological, each row annotated with the balance after
// it applies. Crossed-out entries never affect the running balance (BR-11); with
// includeCrossedOut they are listed anyway, with no balance of their own — the
// ledger screen keeps them visible, struck through.
func Ledger(ctx context.Context, q *store.Queries, accountID int64, includeCrossedOut bool) ([]LedgerEntry, error) {
	rows, err := q.AccountLedger(ctx, store.AccountLedgerParams{AccountID: accountID, IncludeCrossedOut: includeCrossedOut})
	if err != nil {
		return nil, err
	}
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.Transaction.ID
	}
	lines, err := lineItemsFor(ctx, q, ids)
	if err != nil {
		return nil, err
	}
	shots, err := AttachmentURLs(ctx, q, TransactionRecordType, ids, ScreenshotName)
	if err != nil {
		return nil, err
	}
	responses, err := responsesFor(ctx, q, ids)
	if err != nil {
		return nil, err
	}
	documents, err := documentsFor(ctx, q, ids)
	if err != nil {
		return nil, err
	}
	var running int64
	out := make([]LedgerEntry, 0, len(rows))
	for _, row := range rows {
		var balance *int64
		if row.Transaction.CrossedOutAt == nil {
			running += SignedAmount(row.Transaction)
			balance = util.Ptr(running)
		}
		out = append(out, entryView(Entry{row.Transaction, row.CreatedByName}, balance, lines[row.Transaction.ID], optionalURL(shots, row.Transaction.ID), responses[row.Transaction.ID], documents[row.Transaction.ID]))
	}
	return out, nil
}

func TransactionByID(ctx context.Context, q *store.Queries, id int64) (Entry, error) {
	row, err := q.TransactionByID(ctx, id)
	return Entry{row.Transaction, row.CreatedByName}, err
}

// TransactionForOwner finds a transaction the owner may touch: one in their own shop.
func TransactionForOwner(ctx context.Context, q *store.Queries, ownerID, id int64) (Entry, error) {
	row, err := q.TransactionForOwner(ctx, store.TransactionForOwnerParams{ID: id, OwnerID: ownerID})
	return Entry{row.Transaction, row.CreatedByName}, err
}

func transactionByKey(ctx context.Context, q *store.Queries, key string) (*Entry, error) {
	row, err := q.TransactionByIdempotencyKey(ctx, &key)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &Entry{row.Transaction, row.CreatedByName}, nil
}

type LineInput struct {
	Name      string `json:"name"`
	Quantity  string `json:"quantity"`
	UnitPrice string `json:"unit_price"`
	ItemID    *int64 `json:"menu_item_id"` // picked from the shop's items
}

type EntryInput struct {
	Kind           int32       `json:"-"`
	ShopID         int64       `json:"-"` // whose items the lines may name
	Itemized       bool        `json:"itemized"`
	Amount         string      `json:"amount"`
	Description    string      `json:"description"`
	Notes          string      `json:"notes"`
	PaymentMethod  string      `json:"payment_method"`
	OccurredAt     string      `json:"occurred_at"`
	LineItems      []LineInput `json:"line_items"`
	IdempotencyKey string      `json:"idempotency_key"`
}

type line struct {
	name      string
	quantity  decimal.Decimal
	unitPrice int64
	itemID    *int64 // the shop's item, when picked from its list
	pick      *int64 // the item the form named, before linkItems checks it
}

// linesFrom skips a blank row on the itemized form rather than reporting it
// (the Rails reject_if: no name and no price).
func linesFrom(inputs []LineInput, errs *apperr.Errors) []line {
	var lines []line
	for _, in := range inputs {
		if !util.Present(in.Name) && !util.Present(in.UnitPrice) {
			continue
		}
		quantity, quantityOK := money.ParseQuantity(in.Quantity)
		price, priceOK := money.ParseCents(in.UnitPrice)
		errs.Check(util.Present(in.Name), "Line items name can't be blank")
		errs.Check(quantityOK && quantity.IsPositive(), "Line items quantity must be greater than 0")
		switch {
		case !priceOK:
			errs.Add("Line items unit price is not a number")
		case price < 0:
			errs.Add("Line items unit price must be greater than or equal to 0")
		}
		if !quantityOK {
			quantity = decimal.NewFromInt(1)
		}
		lines = append(lines, line{name: util.Deref(util.Presence(in.Name)), quantity: quantity, unitPrice: price, pick: in.ItemID})
	}
	return lines
}

// linkItems ties each picked line to the shop's item (itemLink).
func linkItems(ctx context.Context, q *store.Queries, shopID int64, lines []line, errs *apperr.Errors) error {
	for i := range lines {
		id, err := itemLink(ctx, q, shopID, lines[i].pick, lines[i].name, lines[i].quantity, errs)
		if err != nil {
			return err
		}
		lines[i].itemID = id
	}
	return nil
}

// Recorded is what RecordEntry did. Duplicate: the offline queue replayed an
// entry the book already has, and nothing changed.
type Recorded struct {
	Entry     Entry
	Duplicate bool
	Low       []LowStock // items the credit took to their warning level
}

// RecordEntry records a credit or a payment. BR-12: for an itemized credit
// the line items are the source of truth for the amount.
func RecordEntry(ctx context.Context, q *store.Queries, accountID, by int64, in EntryInput) (Recorded, error) {
	key := util.Presence(in.IdempotencyKey)
	if key != nil {
		if existing, err := transactionByKey(ctx, q, *key); err != nil || existing != nil {
			if existing != nil {
				return Recorded{Entry: *existing, Duplicate: true}, nil
			}
			return Recorded{}, err
		}
	}

	var errs apperr.Errors
	itemized := in.Kind == Credit && in.Itemized
	var lines []line
	if itemized {
		lines = linesFrom(in.LineItems, &errs)
		if err := linkItems(ctx, q, in.ShopID, lines, &errs); err != nil {
			return Recorded{}, err
		}
	}
	amount, amountOK := money.ParseCents(in.Amount)
	if itemized && len(lines) > 0 {
		amount, amountOK = 0, true
		for _, l := range lines {
			amount += money.LineTotal(l.quantity, l.unitPrice)
		}
	}
	errs.Check(amountOK && amount > 0, "Amount must be greater than 0")
	occurredAt, timeOK := util.ParseTime(in.OccurredAt)
	errs.Check(timeOK, "Occurred at is not a valid date")
	if err := errs.Err(); err != nil {
		return Recorded{}, err
	}

	paymentMethod := (*string)(nil)
	if in.Kind == Payment {
		paymentMethod = util.Presence(in.PaymentMethod)
	}
	id, err := q.InsertTransaction(ctx, store.InsertTransactionParams{
		AccountID: accountID, CreatedByID: by, Kind: in.Kind, AmountCents: amount,
		Description: util.Presence(in.Description), Notes: util.Presence(in.Notes), PaymentMethod: paymentMethod,
		Itemized: itemized, OccurredAt: occurredAt, IdempotencyKey: key,
	})
	// Two replays racing each other: the other one got there first.
	if errors.Is(err, pgx.ErrNoRows) && key != nil {
		existing, err := transactionByKey(ctx, q, *key)
		if err != nil || existing == nil {
			return Recorded{}, apperr.NewRule("That entry was already recorded.")
		}
		return Recorded{Entry: *existing, Duplicate: true}, nil
	}
	if err != nil {
		return Recorded{}, err
	}

	for _, l := range lines {
		if err := q.InsertLineItem(ctx, store.InsertLineItemParams{TransactionID: id, Name: l.name, Quantity: l.quantity, UnitPriceCents: l.unitPrice, MenuItemID: l.itemID}); err != nil {
			return Recorded{}, err
		}
	}
	low, err := takeStock(ctx, q, by, stockRef{reason: StockCredit, transactionID: &id}, lines)
	if err != nil {
		return Recorded{}, err
	}
	if err := q.RecomputeBalance(ctx, accountID); err != nil {
		return Recorded{}, err
	}
	if err := Audit(ctx, q, TransactionRecordType, id, "created", &by, map[string]any{"kind": KindKey(in.Kind), "amount_cents": amount}); err != nil {
		return Recorded{}, err
	}
	entry, err := TransactionByID(ctx, q, id)
	return Recorded{Entry: entry, Low: low}, err
}

// AttachScreenshot keeps the photo the shop took of the customer's payment
// screen with the payment it records.
func AttachScreenshot(ctx context.Context, q *store.Queries, files *storage.Storage, transactionID int64, upload *Upload) error {
	var errs apperr.Errors
	ValidateImage("Photo of the payment", upload, &errs)
	if err := errs.Err(); err != nil {
		return err
	}
	blobID, err := CreateBlob(ctx, q, files, *upload)
	if err != nil {
		return err
	}
	return Attach(ctx, q, TransactionRecordType, transactionID, ScreenshotName, blobID)
}

// DetachScreenshots removes these transactions' payment photos, returning
// the files' keys to delete once the transaction has committed.
func DetachScreenshots(ctx context.Context, q *store.Queries, transactionIDs []int64) ([]string, error) {
	return detachFiles(ctx, q, TransactionRecordType, transactionIDs, ScreenshotName)
}

type EditInput struct {
	Amount        string `json:"amount"`
	Description   string `json:"description"`
	Notes         string `json:"notes"`
	PaymentMethod string `json:"payment_method"`
	OccurredAt    string `json:"occurred_at"`
}

// EditTransaction is on the audit record. An itemized credit's amount stays
// the sum of its items (BR-12), whatever the amount field says.
func EditTransaction(ctx context.Context, q *store.Queries, t Entry, by int64, in EditInput) error {
	var errs apperr.Errors
	amount, amountOK := money.ParseCents(in.Amount)
	if t.Itemized {
		total, err := q.LineItemsTotal(ctx, t.ID)
		if err != nil {
			return err
		}
		if total > 0 {
			amount, amountOK = total, true
		}
	}
	errs.Check(amountOK && amount > 0, "Amount must be greater than 0")
	occurredAt := t.OccurredAt
	if parsed, ok := util.ParseTime(in.OccurredAt); !ok {
		errs.Add("Occurred at is not a valid date")
	} else if parsed != nil {
		occurredAt = *parsed
	}
	if err := errs.Err(); err != nil {
		return err
	}

	description, method := t.Description, t.PaymentMethod
	if t.Kind == Credit {
		description = util.Presence(in.Description)
	} else {
		method = util.Presence(in.PaymentMethod)
	}
	err := q.UpdateTransaction(ctx, store.UpdateTransactionParams{
		ID: t.ID, AmountCents: amount, Description: description, Notes: util.Presence(in.Notes), PaymentMethod: method, OccurredAt: occurredAt,
	})
	if err != nil {
		return err
	}
	if err := q.RecomputeBalance(ctx, t.AccountID); err != nil {
		return err
	}
	if err := reopenAfterEdit(ctx, q, t, by); err != nil {
		return err
	}
	return Audit(ctx, q, TransactionRecordType, t.ID, "edited", &by, map[string]any{"amount_cents": amount})
}

// CrossOutTransaction is BR-15: never deleted. The row stays, marked, and out of
// the balance. False when it was already crossed out.
func CrossOutTransaction(ctx context.Context, q *store.Queries, t Entry, by int64) (bool, error) {
	crossed, err := q.CrossOutTransaction(ctx, store.CrossOutTransactionParams{ID: t.ID, CrossedOutByID: &by})
	if err != nil || crossed == 0 {
		return false, err
	}
	if err := q.RecomputeBalance(ctx, t.AccountID); err != nil {
		return false, err
	}
	if err := putBackEntry(ctx, q, t.ID, by); err != nil {
		return false, err
	}
	return true, Audit(ctx, q, TransactionRecordType, t.ID, "crossed_out", &by, map[string]any{"amount_cents": t.AmountCents, "kind": KindKey(t.Kind)})
}
