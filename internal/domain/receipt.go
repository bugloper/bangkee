package domain

import (
	"context"
	"fmt"
	"time"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
)

// A receipt is a payment, written up for the customer to keep. There is no
// receipts table: the payment is the record, its number is derived from the
// payment's own id (so it is unique, and the same every time it is printed),
// and the balance after it is the running balance the ledger gives that
// entry. A crossed-out payment's receipt still opens, marked void, so a
// receipt already handed over can be checked. Credits have no receipt.

// ReceiptNumber is the number printed on a payment's receipt: the shop, then
// the payment.
func ReceiptNumber(shopID, transactionID int64) string {
	return fmt.Sprintf("R%d-%06d", shopID, transactionID)
}

type Receipt struct {
	Number            string     `json:"number"`
	TransactionID     int64      `json:"transaction_id"`
	AccountID         int64      `json:"account_id"`
	AmountCents       int64      `json:"amount_cents"`
	PaidAt            time.Time  `json:"paid_at"`
	PaymentMethod     *string    `json:"payment_method"`
	Notes             *string    `json:"notes"`
	ReceivedBy        string     `json:"received_by"`
	BalanceAfterCents *int64     `json:"balance_after_cents"` // nil when void
	Void              bool       `json:"void"`
	VoidedAt          *time.Time `json:"voided_at"`
	ShopName          string     `json:"shop_name"`
	ShopLine          string     `json:"shop_line"`
	CustomerName      string     `json:"customer_name"`
	CustomerPhone     *string    `json:"customer_phone"`
}

// Receipts are every payment on an account as receipts, newest first.
func Receipts(ctx context.Context, q *store.Queries, account store.Account, shop store.Shop, shopLine string) ([]Receipt, error) {
	ledger, err := Ledger(ctx, q, account.ID, true)
	if err != nil {
		return nil, err
	}
	out := []Receipt{}
	for i := len(ledger) - 1; i >= 0; i-- {
		if entry := ledger[i]; entry.Kind == "payment" {
			out = append(out, receiptOf(entry, account, shop, shopLine))
		}
	}
	return out, nil
}

// ReceiptFor is one payment's receipt. A credit, or an entry on another
// account, has none.
func ReceiptFor(ctx context.Context, q *store.Queries, account store.Account, shop store.Shop, shopLine string, transactionID int64) (Receipt, error) {
	ledger, err := Ledger(ctx, q, account.ID, true)
	if err != nil {
		return Receipt{}, err
	}
	for _, entry := range ledger {
		if entry.ID == transactionID {
			if entry.Kind != "payment" {
				return Receipt{}, apperr.NewNotFound("Only payments have receipts.")
			}
			return receiptOf(entry, account, shop, shopLine), nil
		}
	}
	return Receipt{}, apperr.ErrNotFound
}

func receiptOf(entry LedgerEntry, account store.Account, shop store.Shop, shopLine string) Receipt {
	return Receipt{
		Number: ReceiptNumber(shop.ID, entry.ID), TransactionID: entry.ID, AccountID: account.ID,
		AmountCents: entry.AmountCents, PaidAt: entry.OccurredAt, PaymentMethod: entry.PaymentMethod, Notes: entry.Notes,
		ReceivedBy: entry.CreatedByName, BalanceAfterCents: entry.RunningBalanceCents, Void: entry.CrossedOut, VoidedAt: entry.CrossedOutAt,
		ShopName: shop.Name, ShopLine: shopLine, CustomerName: account.CustomerName, CustomerPhone: account.CustomerPhone,
	}
}
