package domain

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/money"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// The supplier book: what the shop bought on credit from the people it buys
// from, and what it has paid them. It is the customer book turned round —
// here the shop owes — and kept entirely apart: its own tables, its own
// balances, never summed with what customers owe. It follows the same
// rules: entries are never deleted, only crossed out; the balance is
// recomputed from the entries on every change; a replayed entry (same
// idempotency key) is recorded once.

const (
	Purchase int32 = 0
	// Payment (1) is shared with the customer book's kinds.
	SupplierRecordType      = "Supplier"
	SupplierEntryRecordType = "SupplierEntry"
)

type SupplierDTO struct {
	ID             int64      `json:"id"`
	Name           string     `json:"name"`
	Phone          *string    `json:"phone"`
	Notes          *string    `json:"notes"`
	BalanceCents   int64      `json:"balance_cents"` // what the shop owes them; below zero, paid ahead
	LastActivityAt *time.Time `json:"last_activity_at"`
}

func SupplierView(s store.Supplier) SupplierDTO {
	return SupplierDTO{ID: s.ID, Name: s.Name, Phone: s.Phone, Notes: s.Notes, BalanceCents: s.BalanceCents, LastActivityAt: s.LastActivityAt}
}

type SupplierInput struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Notes string `json:"notes"`
}

func (in SupplierInput) validate(ctx context.Context, q *store.Queries, shopID int64, except *int64) error {
	var errs apperr.Errors
	name := strings.TrimSpace(in.Name)
	errs.Check(name != "", "Supplier name can't be blank")
	errs.Check(len([]rune(name)) <= 100, "Keep the name under 100 characters")
	errs.Check(!util.Present(in.Phone) || ValidPhone(in.Phone), "Phone should be a mobile number, like 17 12 34 56")
	if name != "" {
		taken, err := q.SupplierNameTaken(ctx, store.SupplierNameTakenParams{ShopID: shopID, Name: name, ExceptID: except})
		if err != nil {
			return err
		}
		errs.Check(!taken, "You already have a supplier with that name")
	}
	return errs.Err()
}

func CreateSupplier(ctx context.Context, q *store.Queries, shopID int64, in SupplierInput, by int64) (store.Supplier, error) {
	if err := in.validate(ctx, q, shopID, nil); err != nil {
		return store.Supplier{}, err
	}
	supplier, err := q.CreateSupplier(ctx, store.CreateSupplierParams{ShopID: shopID, Name: strings.TrimSpace(in.Name), Phone: util.Presence(in.Phone), Notes: util.Presence(in.Notes)})
	if err != nil {
		return supplier, err
	}
	return supplier, Audit(ctx, q, SupplierRecordType, supplier.ID, "supplier_created", &by, map[string]any{"name": supplier.Name})
}

func UpdateSupplier(ctx context.Context, q *store.Queries, shopID, id int64, in SupplierInput) error {
	if err := in.validate(ctx, q, shopID, &id); err != nil {
		return err
	}
	return q.UpdateSupplier(ctx, store.UpdateSupplierParams{ID: id, ShopID: shopID, Name: strings.TrimSpace(in.Name), Phone: util.Presence(in.Phone), Notes: util.Presence(in.Notes)})
}

// DeleteSupplier removes a supplier the shop no longer owes anything, with
// its entries.
func DeleteSupplier(ctx context.Context, q *store.Queries, s store.Supplier) error {
	if s.BalanceCents != 0 {
		return apperr.NewRule("Settle the balance before removing this supplier.")
	}
	if err := q.DeleteSupplierEntries(ctx, s.ID); err != nil {
		return err
	}
	return q.DeleteSupplier(ctx, s.ID)
}

// SupplierLedger is the supplier's entries oldest first, each with the
// balance after it — the same shape as a customer's ledger, so statements
// and their PDFs cut it the same way.
func SupplierLedger(ctx context.Context, q *store.Queries, supplierID int64, includeCrossedOut bool) ([]LedgerEntry, error) {
	rows, err := q.SupplierLedger(ctx, store.SupplierLedgerParams{SupplierID: supplierID, IncludeCrossedOut: includeCrossedOut})
	if err != nil {
		return nil, err
	}
	var running int64
	out := make([]LedgerEntry, 0, len(rows))
	for _, row := range rows {
		e := row.SupplierEntry
		signed, kind := e.AmountCents, "purchase"
		if e.Kind == Payment {
			signed, kind = -e.AmountCents, "payment"
		}
		var balance *int64
		if e.CrossedOutAt == nil {
			running += signed
			balance = util.Ptr(running)
		}
		out = append(out, LedgerEntry{
			ID: e.ID, Kind: kind, AmountCents: e.AmountCents, SignedAmountCents: signed, Description: e.Description, Notes: e.Notes,
			PaymentMethod: e.PaymentMethod, OccurredAt: e.OccurredAt, CrossedOut: e.CrossedOutAt != nil, CrossedOutAt: e.CrossedOutAt,
			CreatedByName: row.CreatedByName, RunningBalanceCents: balance,
			LineItems: []LineItemDTO{}, Responses: []ResponseDTO{}, Documents: []DocumentDTO{}, Confirmation: "confirmed",
		})
	}
	return out, nil
}

type SupplierEntryInput struct {
	Kind           int32  `json:"-"`
	Amount         string `json:"amount"`
	Description    string `json:"description"`
	Notes          string `json:"notes"`
	PaymentMethod  string `json:"payment_method"`
	OccurredAt     string `json:"occurred_at"`
	IdempotencyKey string `json:"idempotency_key"`
}

// RecordSupplierEntry records a purchase on credit or a payment to the
// supplier. False when it was a replay of an entry already recorded.
func RecordSupplierEntry(ctx context.Context, q *store.Queries, supplier store.Supplier, by int64, in SupplierEntryInput) (bool, error) {
	var errs apperr.Errors
	amount, ok := money.ParseCents(in.Amount)
	errs.Check(ok && amount > 0, "Amount must be greater than 0")
	occurredAt, timeOK := util.ParseTime(in.OccurredAt)
	errs.Check(timeOK, "Occurred at is not a valid date")
	if err := errs.Err(); err != nil {
		return false, err
	}
	at := time.Now()
	if occurredAt != nil {
		at = *occurredAt
	}
	method := (*string)(nil)
	if in.Kind == Payment {
		method = util.Presence(in.PaymentMethod)
	}
	key := util.Presence(in.IdempotencyKey)
	id, err := q.InsertSupplierEntry(ctx, store.InsertSupplierEntryParams{
		SupplierID: supplier.ID, CreatedByID: by, Kind: in.Kind, AmountCents: amount, Description: util.Presence(in.Description),
		Notes: util.Presence(in.Notes), PaymentMethod: method, IdempotencyKey: key, OccurredAt: at,
	})
	if errors.Is(err, pgx.ErrNoRows) && key != nil {
		existing, err := q.SupplierEntryByKey(ctx, key)
		if err != nil || existing.SupplierID != supplier.ID {
			return false, apperr.NewRule("That entry was already recorded.")
		}
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := q.RecomputeSupplierBalance(ctx, supplier.ID); err != nil {
		return false, err
	}
	kind := "purchase"
	if in.Kind == Payment {
		kind = "payment"
	}
	return true, Audit(ctx, q, SupplierEntryRecordType, id, "created", &by, map[string]any{"kind": kind, "amount_cents": amount})
}

func CrossOutSupplierEntry(ctx context.Context, q *store.Queries, e store.SupplierEntry, by int64) error {
	crossed, err := q.CrossOutSupplierEntry(ctx, store.CrossOutSupplierEntryParams{ID: e.ID, CrossedOutByID: &by})
	if err != nil {
		return err
	}
	if crossed == 0 {
		return apperr.NewRule("That entry was already crossed out.")
	}
	if err := q.RecomputeSupplierBalance(ctx, e.SupplierID); err != nil {
		return err
	}
	return Audit(ctx, q, SupplierEntryRecordType, e.ID, "crossed_out", &by, map[string]any{"amount_cents": e.AmountCents})
}
