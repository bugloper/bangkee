package api

import (
	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
)

// Files on an entry, added and removed by the shop. Who may open them is
// decided by the entry (see attachment in settings.go).

func (s *Server) addDocument(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	if err := s.requireFeature(ctx, o.Shop.ID, domain.FeatureAttachments); err != nil {
		return err
	}
	form, err := c.MultipartForm()
	if err != nil {
		return apperr.NewRule("That upload failed.")
	}
	file, err := upload(formFile(form, "file"))
	if err != nil {
		return err
	}
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
		_, err = domain.AddDocument(ctx, q, s.Files, entry, file, o.User.ID)
		return err
	})
	if err != nil {
		return err
	}
	return notice(c, "File attached.", M{"account_id": accountID})
}

func (s *Server) removeDocument(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var key string
	var accountID int64
	err = s.tx(ctx, func(q *store.Queries) error {
		entry, err := domain.TransactionForOwner(ctx, q, o.Shop.OwnerID, paramID(c))
		if err != nil {
			return err
		}
		accountID = entry.AccountID
		key, err = domain.RemoveDocument(ctx, q, entry, paramInt(c, "document_id"), o.User.ID)
		return err
	})
	if err != nil {
		return err
	}
	s.deleteFiles(ctx, []string{key})
	return notice(c, "File removed.", M{"account_id": accountID})
}
