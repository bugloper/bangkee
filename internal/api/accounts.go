package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/money"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

func paramInt(c *echo.Context, name string) int64 {
	id, _ := strconv.ParseInt(c.Param(name), 10, 64)
	return id
}

func paramID(c *echo.Context) int64 { return paramInt(c, "id") }

// customerPhotos is the profile photo of each account's customer, by user.
func (s *Server) customerPhotos(ctx context.Context, accounts []store.Account) (map[int64]string, error) {
	ids := make([]int64, 0, len(accounts))
	for _, a := range accounts {
		if a.CustomerID != nil {
			ids = append(ids, *a.CustomerID)
		}
	}
	return domain.AvatarURLs(ctx, s.Q, ids)
}

// accountView is the account as listed, with its customer's photo.
func accountView(a store.Account, creditDueDays int32, photos map[int64]string) domain.AccountSummary {
	view := domain.AccountView(a, creditDueDays)
	view.CustomerPhotoURL = domain.PhotoURL(photos, a.CustomerID)
	return view
}

// ------------------------------------------------------------- dashboard

func (s *Server) dashboard(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	ctx, q, user := c.Request().Context(), s.Q, cur.User
	monthStart := util.MonthStart(time.Now())

	if user.Role == domain.RoleShopOwner {
		shop, err := domain.ShopForOwner(ctx, q, user.ID)
		if err != nil {
			return err
		}
		if shop == nil {
			return apperr.NewRule("Your shop is missing.")
		}
		return s.ownerDashboard(c, *shop)
	}

	accounts, err := q.CustomerAccounts(ctx, &user.ID)
	if err != nil {
		return err
	}
	ids := make([]int64, len(accounts))
	shopIDs := make([]int64, len(accounts))
	for i, a := range accounts {
		shopIDs[i] = a.Account.ShopID
	}
	shopPhotos, err := domain.ShopPhotoURLs(ctx, q, shopIDs)
	if err != nil {
		return err
	}
	shopOf := map[int64]string{}
	var totalOwed int64
	accountViews := make([]M, 0, len(accounts))
	for i, a := range accounts {
		ids[i] = a.Account.ID
		shopOf[a.Account.ID] = a.ShopName
		totalOwed += max(a.Account.BalanceCents, 0)
		shop := M{"id": a.Account.ShopID, "name": a.ShopName, "photo_url": domain.PhotoURL(shopPhotos, &a.Account.ShopID)}
		accountViews = append(accountViews, withField(domain.AccountView(a.Account, a.CreditDueDays), "shop", shop))
	}
	spent, err := q.SpentSince(ctx, store.SpentSinceParams{AccountIds: ids, Since: monthStart})
	if err != nil {
		return err
	}
	rows, err := q.RecentAccountsTransactions(ctx, ids)
	if err != nil {
		return err
	}
	entries := make([]domain.Entry, len(rows))
	for i, row := range rows {
		entries[i] = domain.Entry{Transaction: row.Transaction, CreatedByName: row.CreatedByName}
	}
	ledger, err := domain.Entries(ctx, q, entries)
	if err != nil {
		return err
	}
	recent := make([]M, 0, len(ledger))
	for i, entry := range ledger {
		accountID := rows[i].Transaction.AccountID
		recent = append(recent, withField(entry, "account", M{"id": accountID, "shop_name": shopOf[accountID]}))
	}
	return c.JSON(http.StatusOK, M{
		"kind": "customer", "total_owed_cents": totalOwed, "spent_month_cents": spent,
		"accounts": accountViews, "recent_transactions": recent,
	})
}

// withField flattens a view into a map and adds one more key — how the
// dashboard hangs the account onto a ledger entry.
func withField(view any, key string, value any) M {
	out := toMap(view)
	out[key] = value
	return out
}

// -------------------------------------------------------------- accounts

func (s *Server) accounts(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var accounts []store.Account
	if query := strings.TrimSpace(c.QueryParam("q")); query != "" {
		accounts, err = domain.SearchAccounts(ctx, s.Q, o.Shop.ID, query)
	} else {
		accounts, err = s.Q.AccountsByName(ctx, o.Shop.ID)
	}
	if err != nil {
		return err
	}
	days := o.Shop.CreditDueDays
	photos, err := s.customerPhotos(ctx, accounts)
	if err != nil {
		return err
	}
	views := make([]domain.AccountSummary, 0, len(accounts))
	for _, a := range accounts {
		keep := true
		switch c.QueryParam("filter") {
		case "outstanding":
			keep = a.BalanceCents > 0
		case "overdue":
			keep = domain.Overdue(a, days)
		case "settled":
			keep = a.BalanceCents <= 0
		}
		if keep {
			views = append(views, accountView(a, days, photos))
		}
	}
	return c.JSON(http.StatusOK, M{"accounts": views})
}

func (s *Server) createAccount(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.AccountInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	var created store.Account
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		created, err = domain.CreateAccount(ctx, q, o.Shop.ID, in, o.User.ID)
		return err
	})
	if err != nil {
		return err
	}
	return notice(c, created.CustomerName+" added.", M{"account_id": created.ID})
}

// ownerOf: an owner sees their own shop's accounts; a customer only their own.
func ownerOf(user store.User, shop store.Shop) bool {
	return user.Role == domain.RoleShopOwner && shop.OwnerID == user.ID
}

func (s *Server) visibleAccount(c *echo.Context) (store.Account, store.Shop, bool, error) {
	cur, err := s.currentUser(c)
	if err != nil {
		return store.Account{}, store.Shop{}, false, err
	}
	ctx := c.Request().Context()
	account, err := s.Q.AccountByID(ctx, paramID(c))
	if err != nil {
		return account, store.Shop{}, false, err
	}
	shop, err := s.Q.ShopByID(ctx, account.ShopID)
	if err != nil {
		return account, shop, false, err
	}
	isOwner := ownerOf(cur.User, shop)
	if !isOwner && (account.CustomerID == nil || *account.CustomerID != cur.User.ID) {
		return account, shop, false, apperr.NewForbidden("That account is not yours to view.")
	}
	return account, shop, isOwner, nil
}

func (s *Server) account(c *echo.Context) error {
	account, shop, isOwner, err := s.visibleAccount(c)
	if err != nil {
		return err
	}
	ctx, q := c.Request().Context(), s.Q
	ledger, err := domain.Ledger(ctx, q, account.ID, true)
	if err != nil {
		return err
	}
	for i, j := 0, len(ledger)-1; i < j; i, j = i+1, j-1 {
		ledger[i], ledger[j] = ledger[j], ledger[i]
	}
	photos, err := s.customerPhotos(ctx, []store.Account{account})
	if err != nil {
		return err
	}
	summary := accountView(account, shop.CreditDueDays, photos)

	if isOwner {
		audit, err := domain.RecentAudit(ctx, q, "Account", account.ID, 10)
		if err != nil {
			return err
		}
		sub, err := domain.SubscriptionFor(ctx, q, shop.ID)
		if err != nil {
			return err
		}
		return c.JSON(http.StatusOK, M{
			"viewer": "owner", "account": summary, "ledger": ledger, "audit_events": audit,
			"write_locked": sub != nil && domain.WriteLocked(*sub),
		})
	}

	banks, err := domain.BankAccounts(ctx, q, shop.ID, true)
	if err != nil {
		return err
	}
	shopPhotos, err := domain.ShopPhotoURLs(ctx, q, []int64{shop.ID})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{
		"viewer": "customer", "account": summary, "shop": M{"id": shop.ID, "name": shop.Name, "photo_url": domain.PhotoURL(shopPhotos, &shop.ID)}, "ledger": ledger,
		"bank_accounts": banks,
	})
}

func (s *Server) updateAccount(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.AccountInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		if _, err := q.AccountInShop(ctx, store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID}); err != nil {
			return err
		}
		return domain.UpdateAccount(ctx, q, o.Shop.ID, paramID(c), in)
	})
	if err != nil {
		return err
	}
	return notice(c, "Customer updated.", nil)
}

func (s *Server) destroyAccount(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var gone []string
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		account, err := q.AccountInShop(ctx, store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
		if err != nil {
			return err
		}
		if account.BalanceCents != 0 {
			return apperr.NewRule("Settle the balance before removing this customer.")
		}
		gone, err = domain.DestroyAccount(ctx, q, account.ID)
		return err
	})
	if err != nil {
		return err
	}
	s.deleteFiles(ctx, gone)
	return notice(c, "Customer removed.", nil)
}

// ------------------------------------------------------ credits/payments

func (s *Server) record(c *echo.Context, kind int32) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.EntryInput
	// A payment may come with a photo of the customer's payment screen, and
	// then it is a multipart form rather than JSON.
	var photo *domain.Upload
	if kind == domain.Payment && strings.HasPrefix(c.Request().Header.Get("Content-Type"), "multipart/") {
		form, err := c.MultipartForm()
		if err != nil {
			return apperr.NewRule("That upload failed.")
		}
		in = domain.EntryInput{
			Amount: formValue(form, "amount"), PaymentMethod: formValue(form, "payment_method"), Notes: formValue(form, "notes"),
			OccurredAt: formValue(form, "occurred_at"), IdempotencyKey: formValue(form, "idempotency_key"),
		}
		if photo, err = upload(formFile(form, "screenshot")); err != nil {
			return err
		}
	} else if err := decode(c, &in); err != nil {
		return err
	}
	in.Kind = kind
	ctx := c.Request().Context()
	var recorded domain.Recorded
	var accountID int64
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		account, err := q.AccountInShop(ctx, store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
		if err != nil {
			return err
		}
		accountID = account.ID
		recorded, err = domain.RecordEntry(ctx, q, account.ID, o.User.ID, in)
		if err != nil || photo == nil || recorded.Duplicate {
			return err
		}
		return domain.AttachScreenshot(ctx, q, s.Files, recorded.Entry.ID, photo)
	})
	if err != nil {
		return err
	}

	credit := kind == domain.Credit
	entry := recorded.Entry
	if recorded.Duplicate {
		// A replay of something already in the book changes nothing.
		message := "That payment was already recorded."
		if credit {
			message = "That entry was already recorded."
		}
		return notice(c, message, M{"account_id": entry.AccountID, "transaction_id": entry.ID, "duplicate": true})
	}
	noun := "Payment"
	if credit {
		noun = "Credit"
		s.Notify.CreditRecorded(ctx, accountID, entry.ID, entry.AmountCents, entry.Description)
	} else {
		s.Notify.PaymentRecorded(ctx, accountID, entry.ID, entry.AmountCents)
	}
	return notice(c, noun+" of "+money.Ngultrum(entry.AmountCents, false)+" recorded.",
		M{"account_id": accountID, "transaction_id": entry.ID, "duplicate": false})
}

func (s *Server) createCredit(c *echo.Context) error  { return s.record(c, domain.Credit) }
func (s *Server) createPayment(c *echo.Context) error { return s.record(c, domain.Payment) }

// statement is the printable page an owner hands over or a customer prints
// for their own records. Crossed-out entries are left out.
func (s *Server) statement(c *echo.Context) error {
	account, shop, isOwner, err := s.visibleAccount(c)
	if err != nil {
		return err
	}
	rows, err := domain.Ledger(c.Request().Context(), s.Q, account.ID, false)
	if err != nil {
		return err
	}
	var debit, credit int64
	for _, row := range rows {
		if row.Kind == "credit" {
			debit += row.AmountCents
		} else {
			credit += row.AmountCents
		}
	}
	viewer := "customer"
	if isOwner {
		viewer = "owner"
	}
	return c.JSON(http.StatusOK, M{
		"account": domain.AccountView(account, shop.CreditDueDays), "shop": M{"id": shop.ID, "name": shop.Name},
		"rows": rows, "debit_cents": debit, "credit_cents": credit, "viewer": viewer, "printed_on": time.Now().UTC(),
	})
}

func (s *Server) invite(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	account, err := s.Q.AccountInShop(c.Request().Context(), store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
	if err != nil {
		return err
	}
	return s.inviteView(c, account, o.Shop.CreditDueDays)
}

func (s *Server) inviteView(c *echo.Context, account store.Account, dueDays int32) error {
	ctx := c.Request().Context()
	// A customer who signs in with phone and PIN can have a forgotten PIN
	// replaced; one with an email resets their password themselves.
	pinCustomer := false
	if account.CustomerID != nil {
		user, err := s.Q.UserByID(ctx, *account.CustomerID)
		if err != nil {
			return err
		}
		pinCustomer = user.EmailAddress == nil
	}
	var resetUntil *time.Time
	if account.PinResetUntil != nil && account.PinResetUntil.After(time.Now()) {
		resetUntil = account.PinResetUntil
	}
	return c.JSON(http.StatusOK, M{
		"account": domain.AccountView(account, dueDays), "invite_path": "/join/" + account.InviteToken,
		"phone": util.Deref(account.CustomerPhone), "pin_customer": pinCustomer, "pin_reset_until": resetUntil,
	})
}

// pinReset: the customer forgot their PIN. A fresh link replaces the old one
// and can set a new PIN for a day; the owner sends it like the first.
func (s *Server) pinReset(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var account store.Account
	err = s.tx(ctx, func(q *store.Queries) error {
		found, err := q.AccountInShop(ctx, store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
		if err != nil {
			return err
		}
		if found.CustomerID == nil {
			return apperr.NewRule("They have not joined yet — send them the invite link.")
		}
		user, err := q.UserByID(ctx, *found.CustomerID)
		if err != nil {
			return err
		}
		if user.EmailAddress != nil {
			return apperr.NewRule("They sign in with an email address, and can reset their own password.")
		}
		until := time.Now().Add(pinResetLifetime)
		if err := q.StartPinReset(ctx, store.StartPinResetParams{ID: found.ID, InviteToken: util.SecureToken(), PinResetUntil: &until}); err != nil {
			return err
		}
		if err := domain.Audit(ctx, q, "Account", found.ID, "pin_reset_sent", &o.User.ID, nil); err != nil {
			return err
		}
		account, err = q.AccountByID(ctx, found.ID)
		return err
	})
	if err != nil {
		return err
	}
	return s.inviteView(c, account, o.Shop.CreditDueDays)
}

const pinResetLifetime = 24 * time.Hour
