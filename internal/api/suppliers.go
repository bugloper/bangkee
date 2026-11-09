package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/document"
	"bangkee/internal/domain"
	"bangkee/internal/money"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// The supplier book. The shop's alone: suppliers never sign in, and nothing
// here is seen by customers. Reading stays open on every plan, so a shop that
// moves down from Pro still sees what it owes; recording needs Pro or up.

func (s *Server) suppliers(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	rows, err := s.Q.SuppliersByName(ctx, o.Shop.ID)
	if err != nil {
		return err
	}
	total, err := s.Q.TotalPayable(ctx, o.Shop.ID)
	if err != nil {
		return err
	}
	list := make([]domain.SupplierDTO, 0, len(rows))
	for _, row := range rows {
		list = append(list, domain.SupplierView(row))
	}
	allowed, err := s.planAllows(ctx, s.Q, o.Shop.ID, domain.FeatureSuppliers)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"suppliers": list, "total_payable_cents": total, "plan_allows": allowed})
}

// ownedSupplier is /suppliers/:id in the owner's shop; anyone else's is not found.
func (s *Server) ownedSupplier(c *echo.Context, q *store.Queries) (*owner, store.Supplier, error) {
	o, err := s.owner(c)
	if err != nil {
		return nil, store.Supplier{}, err
	}
	supplier, err := q.SupplierInShop(c.Request().Context(), store.SupplierInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
	return o, supplier, err
}

func (s *Server) supplier(c *echo.Context) error {
	_, supplier, err := s.ownedSupplier(c, s.Q)
	if err != nil {
		return err
	}
	ledger, err := domain.SupplierLedger(c.Request().Context(), s.Q, supplier.ID, true)
	if err != nil {
		return err
	}
	for i, j := 0, len(ledger)-1; i < j; i, j = i+1, j-1 {
		ledger[i], ledger[j] = ledger[j], ledger[i]
	}
	return c.JSON(http.StatusOK, M{"supplier": domain.SupplierView(supplier), "ledger": ledger})
}

func (s *Server) createSupplier(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.SupplierInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	if err := s.requireFeature(ctx, o.Shop.ID, domain.FeatureSuppliers); err != nil {
		return err
	}
	var created store.Supplier
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		created, err = domain.CreateSupplier(ctx, q, o.Shop.ID, in, o.User.ID)
		return err
	})
	if err != nil {
		return err
	}
	return notice(c, created.Name+" added.", M{"supplier_id": created.ID})
}

func (s *Server) updateSupplier(c *echo.Context) error {
	var in domain.SupplierInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	err := s.tx(ctx, func(q *store.Queries) error {
		o, supplier, err := s.ownedSupplier(c, q)
		if err != nil {
			return err
		}
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		return domain.UpdateSupplier(ctx, q, o.Shop.ID, supplier.ID, in)
	})
	if err != nil {
		return err
	}
	return notice(c, "Supplier updated.", nil)
}

func (s *Server) destroySupplier(c *echo.Context) error {
	ctx := c.Request().Context()
	err := s.tx(ctx, func(q *store.Queries) error {
		o, supplier, err := s.ownedSupplier(c, q)
		if err != nil {
			return err
		}
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		return domain.DeleteSupplier(ctx, q, supplier)
	})
	if err != nil {
		return err
	}
	return notice(c, "Supplier removed.", nil)
}

func (s *Server) recordSupplierEntry(c *echo.Context, kind int32) error {
	var in domain.SupplierEntryInput
	if err := decode(c, &in); err != nil {
		return err
	}
	in.Kind = kind
	ctx := c.Request().Context()
	var recorded bool
	err := s.tx(ctx, func(q *store.Queries) error {
		o, supplier, err := s.ownedSupplier(c, q)
		if err != nil {
			return err
		}
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		if err := s.requireFeature(ctx, o.Shop.ID, domain.FeatureSuppliers); err != nil {
			return err
		}
		recorded, err = domain.RecordSupplierEntry(ctx, q, supplier, o.User.ID, in)
		return err
	})
	if err != nil {
		return err
	}
	if !recorded {
		return notice(c, "That entry was already recorded.", M{"duplicate": true})
	}
	noun := "Purchase"
	if kind == domain.Payment {
		noun = "Payment"
	}
	amount, _ := money.ParseCents(in.Amount)
	return notice(c, noun+" of "+money.Ngultrum(amount, false)+" recorded.", M{"duplicate": false})
}

func (s *Server) createSupplierPurchase(c *echo.Context) error {
	return s.recordSupplierEntry(c, domain.Purchase)
}
func (s *Server) createSupplierPayment(c *echo.Context) error {
	return s.recordSupplierEntry(c, domain.Payment)
}

func (s *Server) crossOutSupplierEntry(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var supplierID int64
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		entry, err := q.SupplierEntryInShop(ctx, store.SupplierEntryInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
		if err != nil {
			return err
		}
		supplierID = entry.SupplierID
		return domain.CrossOutSupplierEntry(ctx, q, entry, o.User.ID)
	})
	if err != nil {
		return err
	}
	return notice(c, "Entry crossed out. It stays on the record.", M{"supplier_id": supplierID})
}

func (s *Server) supplierStatement(c *echo.Context) error {
	o, supplier, err := s.ownedSupplier(c, s.Q)
	if err != nil {
		return err
	}
	from, to, err := domain.ParseStatementRange(c.QueryParam("from"), c.QueryParam("to"))
	if err != nil {
		return err
	}
	ledger, err := domain.SupplierLedger(c.Request().Context(), s.Q, supplier.ID, false)
	if err != nil {
		return err
	}
	statement := domain.CutStatement(ledger, from, to, time.Now())
	if strings.HasSuffix(c.Request().URL.Path, ".pdf") {
		pdf, err := document.Statement(document.StatementInput{
			ShopName: o.Shop.Name, ShopLine: shopLine(o.Shop), CustomerName: supplier.Name, Customer: util.Deref(supplier.Phone), Statement: statement, Supplier: true,
		})
		if err != nil {
			return err
		}
		return sendPDF(c, fmt.Sprintf("Supplier statement %s %s.pdf", supplier.Name, statement.GeneratedAt.In(domain.Thimphu).Format("2006-01-02")), pdf)
	}
	return c.JSON(http.StatusOK, M{"supplier": domain.SupplierView(supplier), "statement": statement})
}
