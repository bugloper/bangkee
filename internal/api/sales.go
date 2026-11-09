package api

import (
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/domain"
	"bangkee/internal/money"
	"bangkee/internal/store"
)

// Sales paid on the spot (domain/sales.go): a day's sales and takings,
// recording one, and crossing one out. Every plan has them.

// sales is one day at the counter: ?day=2026-11-09, today when absent.
func (s *Server) sales(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	now := time.Now()
	day := domain.ThimphuDay(c.QueryParam("day"), now)
	out, err := domain.SalesForDay(c.Request().Context(), s.Q, o.Shop.ID, day, now)
	if err != nil {
		return err
	}
	return c.JSON(200, M{"day": out, "methods": domain.SaleMethods})
}

func (s *Server) recordSale(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.SaleInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	var id, amount int64
	var duplicate bool
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		id, amount, duplicate, err = domain.RecordSale(ctx, q, o.Shop.ID, o.User.ID, in, time.Now())
		return err
	})
	if err != nil {
		return err
	}
	if duplicate {
		return notice(c, "That sale was already recorded.", M{"duplicate": true})
	}
	return notice(c, "Sale of "+money.Ngultrum(amount, false)+" recorded.", M{"sale_id": id, "duplicate": false})
}

func (s *Server) crossOutSale(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		sale, err := q.SaleInShop(ctx, store.SaleInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
		if err != nil {
			return err
		}
		return domain.CrossOutSale(ctx, q, sale, o.User.ID)
	})
	if err != nil {
		return err
	}
	return notice(c, "Sale crossed out. It stays on the record, out of the takings.", nil)
}
