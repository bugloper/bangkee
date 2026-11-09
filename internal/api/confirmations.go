package api

import (
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/money"
	"bangkee/internal/store"
)

// The customer's side of the shared book: confirming entries, flagging the
// wrong ones, and the shop's reply. Only the account's own customer can
// confirm or flag; only the shop can reply. Nothing here changes a balance.

// customerEntry finds /transactions/:id for the customer whose book it is in.
// Anyone else is told it does not exist.
func (s *Server) customerEntry(c *echo.Context, q *store.Queries) (domain.Entry, int64, error) {
	cur, err := s.currentUser(c)
	if err != nil {
		return domain.Entry{}, 0, err
	}
	ctx := c.Request().Context()
	entry, err := domain.TransactionByID(ctx, q, paramID(c))
	if errors.Is(err, pgx.ErrNoRows) {
		return entry, 0, apperr.ErrNotFound
	}
	if err != nil {
		return entry, 0, err
	}
	account, err := q.AccountByID(ctx, entry.AccountID)
	if err != nil {
		return entry, 0, err
	}
	if account.CustomerID == nil || *account.CustomerID != cur.User.ID {
		return entry, 0, apperr.ErrNotFound
	}
	return entry, cur.User.ID, nil
}

func (s *Server) confirmEntry(c *echo.Context) error {
	ctx := c.Request().Context()
	var accountID int64
	err := s.tx(ctx, func(q *store.Queries) error {
		entry, customer, err := s.customerEntry(c, q)
		if err != nil {
			return err
		}
		accountID = entry.AccountID
		return domain.ConfirmEntry(ctx, q, entry, customer)
	})
	if err != nil {
		return err
	}
	return notice(c, "Confirmed. Thank you.", M{"account_id": accountID})
}

func (s *Server) disputeEntry(c *echo.Context) error {
	var in struct {
		Reason string `json:"reason"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	var entry domain.Entry
	err := s.tx(ctx, func(q *store.Queries) error {
		found, customer, err := s.customerEntry(c, q)
		if err != nil {
			return err
		}
		entry = found
		return domain.DisputeEntry(ctx, q, entry, customer, in.Reason)
	})
	if err != nil {
		return err
	}
	s.Notify.EntryDisputed(ctx, entry.AccountID, entry.ID, domain.KindKey(entry.Kind), entry.AmountCents, in.Reason)
	return notice(c, "Flagged. The shop has been told, and your balance is unchanged until they look at it.", M{"account_id": entry.AccountID})
}

func (s *Server) replyToDispute(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in struct {
		Note string `json:"note"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	var entry domain.Entry
	err = s.tx(ctx, func(q *store.Queries) error {
		entry, err = domain.TransactionForOwner(ctx, q, o.User.ID, paramID(c))
		if err != nil {
			return err
		}
		return domain.ReplyToDispute(ctx, q, entry, o.User.ID, in.Note)
	})
	if err != nil {
		return err
	}
	s.Notify.DisputeReplied(ctx, entry.AccountID, entry.ID, in.Note)
	return notice(c, "Reply sent. The entry waits for the customer to look again.", M{"account_id": entry.AccountID})
}

// confirmAll is the customer confirming everything still waiting on one account.
func (s *Server) confirmAll(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var count int
	err = s.tx(ctx, func(q *store.Queries) error {
		account, err := q.AccountByID(ctx, paramID(c))
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && (account.CustomerID == nil || *account.CustomerID != cur.User.ID)) {
			return apperr.ErrNotFound
		}
		if err != nil {
			return err
		}
		count, err = domain.ConfirmAll(ctx, q, account.ID, cur.User.ID)
		return err
	})
	if err != nil {
		return err
	}
	if count == 0 {
		return notice(c, "Nothing was waiting to be confirmed.", M{"confirmed": 0})
	}
	return notice(c, money.Pluralize(int64(count), "entry")+" confirmed.", M{"confirmed": count})
}
