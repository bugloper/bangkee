package api

import (
	"encoding/json"
	"net/http"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
)

// Transactions after the fact (edit, cross out), and the shop's published bank
// details.

func toMap(view any) M {
	encoded, _ := json.Marshal(view)
	out := M{}
	_ = json.Unmarshal(encoded, &out)
	return out
}

func (s *Server) transaction(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	entry, err := domain.TransactionForOwner(ctx, s.Q, o.Shop.OwnerID, paramID(c))
	if err != nil {
		return err
	}
	account, err := s.Q.AccountByID(ctx, entry.AccountID)
	if err != nil {
		return err
	}
	views, err := domain.Entries(ctx, s.Q, []domain.Entry{entry})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"transaction": views[0], "account": M{"id": account.ID, "display_name": account.CustomerName}})
}

func (s *Server) updateTransaction(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.EditInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	var accountID int64
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		entry, err := domain.TransactionForOwner(ctx, q, o.Shop.OwnerID, paramID(c))
		if err != nil {
			return err
		}
		accountID = entry.AccountID
		return domain.EditTransaction(ctx, q, entry, o.User.ID, in)
	})
	if err != nil {
		return err
	}
	return notice(c, "Transaction updated.", M{"account_id": accountID})
}

// crossOutTransaction is BR-15: never deleted. The row stays, marked, and out of
// the balance.
func (s *Server) crossOutTransaction(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var entry domain.Entry
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		entry, err = domain.TransactionForOwner(ctx, q, o.Shop.OwnerID, paramID(c))
		if err != nil {
			return err
		}
		crossed, err := domain.CrossOutTransaction(ctx, q, entry, o.User.ID)
		if err == nil && !crossed {
			err = apperr.NewRule("That entry was already crossed out.")
		}
		return err
	})
	if err != nil {
		return err
	}
	s.Notify.TransactionCrossedOut(ctx, entry.AccountID, entry.ID, domain.KindKey(entry.Kind), entry.AmountCents)
	return notice(c, "Entry crossed out. It stays on the record.", M{"account_id": entry.AccountID})
}

// ----------------------------------------------------------- bank details

func (s *Server) bankAccounts(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	banks, err := domain.BankAccounts(c.Request().Context(), s.Q, o.Shop.ID, false)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"bank_accounts": banks})
}

func (s *Server) bankAccount(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	if err := s.requireWritable(ctx, s.Q, o.Shop.ID); err != nil {
		return err
	}
	bank, err := s.Q.BankAccountInShop(ctx, store.BankAccountInShopParams{ShopID: o.Shop.ID, ID: paramID(c)})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, domain.BankAccountView(bank))
}

func (s *Server) saveBankAccount(c *echo.Context, id int64, message string) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.BankAccountInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		if id != 0 {
			if _, err := q.BankAccountInShop(ctx, store.BankAccountInShopParams{ShopID: o.Shop.ID, ID: id}); err != nil {
				return err
			}
		}
		return domain.SaveBankAccount(ctx, q, o.Shop.ID, id, in)
	})
	if err != nil {
		return err
	}
	return notice(c, message, nil)
}

func (s *Server) createBankAccount(c *echo.Context) error {
	return s.saveBankAccount(c, 0, "Bank details saved.")
}

func (s *Server) updateBankAccount(c *echo.Context) error {
	return s.saveBankAccount(c, paramID(c), "Bank details updated.")
}

func (s *Server) destroyBankAccount(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		if _, err := q.BankAccountInShop(ctx, store.BankAccountInShopParams{ShopID: o.Shop.ID, ID: paramID(c)}); err != nil {
			return err
		}
		return q.DeleteBankAccount(ctx, store.DeleteBankAccountParams{ShopID: o.Shop.ID, ID: paramID(c)})
	})
	if err != nil {
		return err
	}
	return notice(c, "Bank details removed.", nil)
}
