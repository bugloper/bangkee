package api

import (
	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
)

// Profile photos: anyone signed in can put a photo on themselves, and an
// owner one on their shop. Served by attachment (settings.go) to anyone
// signed in.

func (s *Server) setMyPhoto(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	photo, err := s.photoUpload(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var replaced []string
	err = s.tx(ctx, func(q *store.Queries) error {
		replaced, err = domain.SetAvatar(ctx, q, s.Files, cur.User.ID, photo)
		return err
	})
	if err != nil {
		return err
	}
	s.deleteFiles(ctx, replaced)
	return notice(c, "Profile photo saved.", nil)
}

func (s *Server) removeMyPhoto(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var gone []string
	err = s.tx(ctx, func(q *store.Queries) error {
		gone, err = domain.RemoveAvatar(ctx, q, cur.User.ID)
		return err
	})
	if err != nil {
		return err
	}
	s.deleteFiles(ctx, gone)
	return notice(c, "Profile photo removed.", nil)
}

func (s *Server) setShopPhoto(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	photo, err := s.photoUpload(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var replaced []string
	err = s.tx(ctx, func(q *store.Queries) error {
		replaced, err = domain.SetShopPhoto(ctx, q, s.Files, o.Shop.ID, photo)
		return err
	})
	if err != nil {
		return err
	}
	s.deleteFiles(ctx, replaced)
	return notice(c, "Shop photo saved.", nil)
}

func (s *Server) removeShopPhoto(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var gone []string
	err = s.tx(ctx, func(q *store.Queries) error {
		gone, err = domain.RemoveShopPhoto(ctx, q, o.Shop.ID)
		return err
	})
	if err != nil {
		return err
	}
	s.deleteFiles(ctx, gone)
	return notice(c, "Shop photo removed.", nil)
}

// photoUpload is the "image" file of a multipart form.
func (s *Server) photoUpload(c *echo.Context) (*domain.Upload, error) {
	form, err := c.MultipartForm()
	if err != nil {
		return nil, apperr.NewRule("That upload failed.")
	}
	return upload(formFile(form, "image"))
}
