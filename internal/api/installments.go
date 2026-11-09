package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
)

// Installment plans on an account: seen by the shop and the customer, agreed
// and cancelled by the shop.

func (s *Server) installmentPlans(c *echo.Context) error {
	account, _, _, err := s.visibleAccount(c)
	if err != nil {
		return err
	}
	plans, err := domain.InstallmentPlans(c.Request().Context(), s.Q, account.ID, time.Now())
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"plans": plans, "balance_cents": account.BalanceCents})
}

func (s *Server) createInstallmentPlan(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.InstallmentPlanInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	if err := s.requireFeature(ctx, o.Shop.ID, domain.FeatureInstallments); err != nil {
		return err
	}
	var plan store.InstallmentPlan
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		account, err := q.AccountInShop(ctx, store.AccountInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
		if err != nil {
			return err
		}
		plan, err = domain.CreateInstallmentPlan(ctx, q, account, o.User.ID, in, time.Now())
		return err
	})
	if err != nil {
		return err
	}
	s.Notify.InstallmentPlanAgreed(ctx, plan.AccountID, plan.TotalCents, plan.InstallmentCount, plan.Frequency, plan.FirstDueOn)
	return notice(c, "Installment plan agreed.", M{"plan_id": plan.ID})
}

func (s *Server) cancelInstallmentPlan(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	err = s.tx(ctx, func(q *store.Queries) error {
		plan, err := domain.InstallmentPlanByID(ctx, q, paramID(c))
		if err != nil {
			return err
		}
		if _, err := q.AccountInShop(ctx, store.AccountInShopParams{ID: plan.AccountID, ShopID: o.Shop.ID}); err != nil {
			return apperr.ErrNotFound
		}
		return domain.CancelInstallmentPlan(ctx, q, plan, o.User.ID)
	})
	if err != nil {
		return err
	}
	return notice(c, "Plan cancelled. Payments already made still count; the balance is unchanged.", nil)
}
