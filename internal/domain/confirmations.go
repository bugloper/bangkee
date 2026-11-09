package domain

import (
	"context"
	"strings"
	"time"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// The customer's word on each entry. The shop records; the customer, from
// their own phone, confirms an entry is right or flags it as wrong with a
// reason. Neither touches the balance: a disputed entry stays in the book,
// and counts, until the shop edits it or crosses it out — the customer can
// object, never rewrite. The shop can answer a dispute, which sends the
// entry back to the customer to look at again.

const (
	Pending   int32 = 0
	Confirmed int32 = 1
	Disputed  int32 = 2
)

func ConfirmationKey(c int32) string {
	return [...]string{"pending", "confirmed", "disputed"}[c]
}

type ResponseDTO struct {
	Action string    `json:"action"` // confirmed | disputed | shop_replied | changed
	Note   *string   `json:"note"`
	By     string    `json:"by"`
	At     time.Time `json:"at"`
}

func responsesFor(ctx context.Context, q *store.Queries, ids []int64) (map[int64][]ResponseDTO, error) {
	rows, err := q.TransactionResponsesFor(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := map[int64][]ResponseDTO{}
	for _, r := range rows {
		out[r.TransactionID] = append(out[r.TransactionID], ResponseDTO{Action: r.Action, Note: r.Note, By: r.UserName, At: r.CreatedAt})
	}
	return out, nil
}

const maxDisputeReason = 500

// ConfirmEntry is the customer saying the entry is right. Confirming a
// disputed entry withdraws the dispute.
func ConfirmEntry(ctx context.Context, q *store.Queries, t Entry, customerID int64) error {
	if t.CrossedOutAt != nil {
		return apperr.NewRule("That entry was crossed out; there is nothing to confirm.")
	}
	changed, err := q.SetConfirmation(ctx, store.SetConfirmationParams{Confirmation: Confirmed, ID: t.ID, FromStates: []int32{Pending, Disputed}})
	if err != nil {
		return err
	}
	if changed == 0 {
		return apperr.NewRule("That entry is already confirmed.")
	}
	return respond(ctx, q, t.ID, customerID, "confirmed", nil)
}

// DisputeEntry is the customer saying the entry is wrong, and why. A
// confirmed entry can still be disputed: people notice things late.
func DisputeEntry(ctx context.Context, q *store.Queries, t Entry, customerID int64, reason string) error {
	reason = strings.TrimSpace(reason)
	var errs apperr.Errors
	errs.Check(reason != "", "Say what is wrong with this entry")
	errs.Check(len([]rune(reason)) <= maxDisputeReason, "Keep the reason under 500 characters")
	if err := errs.Err(); err != nil {
		return err
	}
	if t.CrossedOutAt != nil {
		return apperr.NewRule("That entry was crossed out; it no longer counts.")
	}
	changed, err := q.SetConfirmation(ctx, store.SetConfirmationParams{Confirmation: Disputed, ID: t.ID, FromStates: []int32{Pending, Confirmed}})
	if err != nil {
		return err
	}
	if changed == 0 {
		return apperr.NewRule("You have already flagged this entry.")
	}
	return respond(ctx, q, t.ID, customerID, "disputed", &reason)
}

// ReplyToDispute is the shop answering a flagged entry without changing it
// ("you took two bags, here is the note"). The entry goes back to waiting
// for the customer.
func ReplyToDispute(ctx context.Context, q *store.Queries, t Entry, ownerID int64, note string) error {
	note = strings.TrimSpace(note)
	var errs apperr.Errors
	errs.Check(note != "", "Write a reply for the customer")
	errs.Check(len([]rune(note)) <= maxDisputeReason, "Keep the reply under 500 characters")
	if err := errs.Err(); err != nil {
		return err
	}
	changed, err := q.SetConfirmation(ctx, store.SetConfirmationParams{Confirmation: Pending, ID: t.ID, FromStates: []int32{Disputed}})
	if err != nil {
		return err
	}
	if changed == 0 {
		return apperr.NewRule("That entry is not disputed.")
	}
	return respond(ctx, q, t.ID, ownerID, "shop_replied", &note)
}

// ConfirmAll confirms every entry still waiting on the account, returning how many.
func ConfirmAll(ctx context.Context, q *store.Queries, accountID, customerID int64) (int, error) {
	ids, err := q.ConfirmAllPending(ctx, accountID)
	if err != nil || len(ids) == 0 {
		return 0, err
	}
	if err := q.AddTransactionResponses(ctx, store.AddTransactionResponsesParams{Ids: ids, UserID: customerID, Action: "confirmed"}); err != nil {
		return 0, err
	}
	return len(ids), Audit(ctx, q, "Account", accountID, "entries_confirmed", &customerID, map[string]any{"count": len(ids)})
}

// reopenAfterEdit: the shop changed an entry the customer had answered, so
// it waits for them again.
func reopenAfterEdit(ctx context.Context, q *store.Queries, t Entry, by int64) error {
	if t.Confirmation == Pending {
		return nil
	}
	if _, err := q.SetConfirmation(ctx, store.SetConfirmationParams{Confirmation: Pending, ID: t.ID, FromStates: []int32{Confirmed, Disputed}}); err != nil {
		return err
	}
	return respond(ctx, q, t.ID, by, "changed", nil)
}

func respond(ctx context.Context, q *store.Queries, transactionID, by int64, action string, note *string) error {
	if err := q.AddTransactionResponse(ctx, store.AddTransactionResponseParams{TransactionID: transactionID, UserID: by, Action: action, Note: note}); err != nil {
		return err
	}
	metadata := map[string]any{}
	if note != nil {
		metadata["note"] = util.Deref(note)
	}
	return Audit(ctx, q, TransactionRecordType, transactionID, action, &by, metadata)
}
