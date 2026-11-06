package domain

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

type AccountSummary struct {
	ID             int64      `json:"id"`
	CustomerName   string     `json:"customer_name"`
	DisplayName    string     `json:"display_name"`
	CustomerPhone  *string    `json:"customer_phone"`
	BalanceCents   int64      `json:"balance_cents"`
	Overdue        bool       `json:"overdue"`
	DaysOverdue    int64      `json:"days_overdue"`
	Joined         bool       `json:"joined"`
	LastActivityAt *time.Time `json:"last_activity_at"`
	// The customer's own profile photo, once they have joined and added one.
	CustomerPhotoURL *string `json:"customer_photo_url"`
}

// Overdue is BR-19: owed money, and nothing has happened for longer than the
// shop allows.
func Overdue(a store.Account, creditDueDays int32) bool {
	if a.BalanceCents <= 0 {
		return false
	}
	return a.LastActivityAt == nil || a.LastActivityAt.Before(time.Now().AddDate(0, 0, -int(creditDueDays)))
}

func DaysOverdue(a store.Account, creditDueDays int32) int64 {
	if !Overdue(a, creditDueDays) {
		return 0
	}
	reference := a.CreatedAt
	if a.LastActivityAt != nil {
		reference = *a.LastActivityAt
	}
	return int64(time.Since(reference).Hours() / 24)
}

func AccountView(a store.Account, creditDueDays int32) AccountSummary {
	return AccountSummary{
		ID: a.ID, CustomerName: a.CustomerName, DisplayName: a.CustomerName, CustomerPhone: a.CustomerPhone,
		BalanceCents: a.BalanceCents, Overdue: Overdue(a, creditDueDays), DaysOverdue: DaysOverdue(a, creditDueDays),
		Joined: a.CustomerID != nil, LastActivityAt: a.LastActivityAt,
	}
}

func AccountByInviteToken(ctx context.Context, q *store.Queries, token string) (*store.Account, error) {
	account, err := q.AccountByInviteToken(ctx, token)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &account, err
}

// SearchAccounts finds by name or phone; the query's wildcards are escaped
// so a "%" typed into the search box means a percent sign.
func SearchAccounts(ctx context.Context, q *store.Queries, shopID int64, query string) ([]store.Account, error) {
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query)
	return q.SearchAccounts(ctx, store.SearchAccountsParams{ShopID: shopID, Pattern: "%" + escaped + "%"})
}

type AccountInput struct {
	CustomerName  string `json:"customer_name"`
	CustomerPhone string `json:"customer_phone"`
}

// validate: a name, and a phone — the invite goes to it, and it is how the
// customer signs in. One customer per phone in a shop's book.
func (in AccountInput) validate(ctx context.Context, q *store.Queries, shopID int64, exceptID *int64) error {
	var errs apperr.Errors
	errs.Check(util.Present(in.CustomerName), "Customer name can't be blank")
	switch {
	case !util.Present(in.CustomerPhone):
		errs.Add("Phone can't be blank")
	case !ValidPhone(in.CustomerPhone):
		errs.Add("Phone should be a mobile number, like 17 12 34 56")
	default:
		taken, err := q.AccountPhoneTaken(ctx, store.AccountPhoneTakenParams{ShopID: shopID, Phone: NormalizePhone(in.CustomerPhone), ExceptID: exceptID})
		if err != nil {
			return err
		}
		errs.Check(!taken, "A customer with that phone is already in your book")
	}
	return errs.Err()
}

func CreateAccount(ctx context.Context, q *store.Queries, shopID int64, in AccountInput, by int64) (store.Account, error) {
	if err := in.validate(ctx, q, shopID, nil); err != nil {
		return store.Account{}, err
	}
	name := strings.TrimSpace(in.CustomerName)
	id, err := q.CreateAccount(ctx, store.CreateAccountParams{
		ShopID: shopID, CustomerName: name, CustomerPhone: util.Presence(in.CustomerPhone), InviteToken: util.SecureToken(),
	})
	if err != nil {
		return store.Account{}, err
	}
	if err := Audit(ctx, q, "Account", id, "account_created", &by, map[string]any{"customer_name": name}); err != nil {
		return store.Account{}, err
	}
	return q.AccountByID(ctx, id)
}

func UpdateAccount(ctx context.Context, q *store.Queries, shopID, id int64, in AccountInput) error {
	if err := in.validate(ctx, q, shopID, &id); err != nil {
		return err
	}
	return q.UpdateAccount(ctx, store.UpdateAccountParams{
		ID: id, CustomerName: strings.TrimSpace(in.CustomerName), CustomerPhone: util.Presence(in.CustomerPhone),
	})
}

// ClaimAccount is BR-24: link this account to a signed-in customer. False
// when it was already joined.
func ClaimAccount(ctx context.Context, q *store.Queries, account store.Account, user store.User) (bool, error) {
	if account.CustomerID != nil {
		return false, nil
	}
	phone := account.CustomerPhone
	if phone == nil || *phone == "" {
		phone = user.Phone
	}
	claimed, err := q.ClaimAccount(ctx, store.ClaimAccountParams{ID: account.ID, CustomerID: &user.ID, CustomerPhone: phone})
	if err != nil || claimed == 0 {
		return false, err
	}
	return true, Audit(ctx, q, "Account", account.ID, "customer_joined", &user.ID, nil)
}

// DestroyAccount removes the account with everything hanging off it:
// transactions with their line items, payment screenshots and audit
// trails. Only reachable once the balance is zero. It returns the
// screenshots' file keys, to delete once the transaction has committed.
func DestroyAccount(ctx context.Context, q *store.Queries, accountID int64) ([]string, error) {
	transactionIDs, err := q.AccountTransactionIDs(ctx, accountID)
	if err != nil {
		return nil, err
	}
	var keys []string
	steps := []func() error{
		func() error {
			keys, err = DetachScreenshots(ctx, q, transactionIDs)
			return err
		},
		func() error {
			return q.DeleteAuditEvents(ctx, store.DeleteAuditEventsParams{AuditableType: TransactionRecordType, Ids: transactionIDs})
		},
		func() error { return q.DeleteLineItemsOf(ctx, transactionIDs) },
		func() error { return q.DeleteAccountTransactions(ctx, accountID) },
		func() error {
			return q.DeleteAuditEvents(ctx, store.DeleteAuditEventsParams{AuditableType: "Account", Ids: []int64{accountID}})
		},
		func() error { return q.DeleteAccount(ctx, accountID) },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return nil, err
		}
	}
	return keys, nil
}
