package api

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/document"
	"bangkee/internal/domain"
)

// Receipts: every payment on an account, and each one as a document. The
// shop and the account's customer see them; nobody else learns a payment
// exists.

func (s *Server) receipts(c *echo.Context) error {
	account, shop, _, err := s.visibleAccount(c)
	if err != nil {
		return err
	}
	list, err := domain.Receipts(c.Request().Context(), s.Q, account, shop, shopLine(shop))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"account": domain.AccountView(account, shop.CreditDueDays), "receipts": list})
}

// paymentReceipt finds the receipt for /transactions/:id, for the shop or
// the account's customer.
func (s *Server) paymentReceipt(c *echo.Context) (domain.Receipt, error) {
	cur, err := s.currentUser(c)
	if err != nil {
		return domain.Receipt{}, err
	}
	ctx := c.Request().Context()
	entry, err := domain.TransactionByID(ctx, s.Q, paramID(c))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Receipt{}, apperr.ErrNotFound
	}
	if err != nil {
		return domain.Receipt{}, err
	}
	account, err := s.Q.AccountByID(ctx, entry.AccountID)
	if err != nil {
		return domain.Receipt{}, err
	}
	shop, err := s.Q.ShopByID(ctx, account.ShopID)
	if err != nil {
		return domain.Receipt{}, err
	}
	if !ownerOf(cur.User, shop) && (account.CustomerID == nil || *account.CustomerID != cur.User.ID) {
		return domain.Receipt{}, apperr.ErrNotFound
	}
	return domain.ReceiptFor(ctx, s.Q, account, shop, shopLine(shop), entry.ID)
}

func (s *Server) receipt(c *echo.Context) error {
	r, err := s.paymentReceipt(c)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"receipt": r})
}

func (s *Server) receiptPDF(c *echo.Context) error {
	r, err := s.paymentReceipt(c)
	if err != nil {
		return err
	}
	pdf, err := document.Receipt(r)
	if err != nil {
		return err
	}
	return sendPDF(c, "Receipt "+r.Number+".pdf", pdf)
}
