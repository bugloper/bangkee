package api

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// The shop's items, set up by the owner, and their photos.

// ------------------------------------------------------------------ menu

func (s *Server) menuItems(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	if err := s.requireWritable(ctx, s.Q, o.Shop.ID); err != nil {
		return err
	}
	items, err := s.Q.MenuItemsOrdered(ctx, store.MenuItemsOrderedParams{ShopID: o.Shop.ID, AvailableOnly: false})
	if err != nil {
		return err
	}
	images, err := domain.ItemImageURLs(ctx, s.Q, itemIDs(items))
	if err != nil {
		return err
	}
	views := make([]domain.MenuItemDTO, 0, len(items))
	for _, item := range items {
		views = append(views, domain.MenuItemView(item, images))
	}
	return c.JSON(http.StatusOK, M{"items": views})
}

func (s *Server) menuItem(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	if err := s.requireWritable(ctx, s.Q, o.Shop.ID); err != nil {
		return err
	}
	item, err := s.Q.MenuItemInShop(ctx, store.MenuItemInShopParams{ShopID: o.Shop.ID, ID: paramID(c)})
	if err != nil {
		return err
	}
	images, err := domain.ItemImageURLs(ctx, s.Q, []int64{item.ID})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, domain.MenuItemView(item, images))
}

func (s *Server) saveMenuItem(c *echo.Context, id int64, suffix string) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.MenuItemInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	var name string
	var savedID int64
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		var item *store.MenuItem
		if id != 0 {
			found, err := q.MenuItemInShop(ctx, store.MenuItemInShopParams{ShopID: o.Shop.ID, ID: id})
			if err != nil {
				return err
			}
			item = &found
		}
		savedID, name, err = domain.SaveMenuItem(ctx, q, o.Shop.ID, item, in)
		return err
	})
	if err != nil {
		return err
	}
	return notice(c, name+suffix, M{"id": savedID})
}

func (s *Server) createMenuItem(c *echo.Context) error {
	return s.saveMenuItem(c, 0, " added to your items.")
}

func (s *Server) updateMenuItem(c *echo.Context) error {
	return s.saveMenuItem(c, paramID(c), " updated.")
}

func (s *Server) destroyMenuItem(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var name string
	var gone []string
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		item, err := q.MenuItemInShop(ctx, store.MenuItemInShopParams{ShopID: o.Shop.ID, ID: paramID(c)})
		if err != nil {
			return err
		}
		name = item.Name
		gone, err = domain.DestroyMenuItem(ctx, q, item)
		return err
	})
	if err != nil {
		return err
	}
	s.deleteFiles(ctx, gone)
	return notice(c, name+" removed from your items.", nil)
}

// ------------------------------------------------------------ item photos

// setItemImage puts a photo on one of the shop's items, replacing any it had.
func (s *Server) setItemImage(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	form, err := c.MultipartForm()
	if err != nil {
		return apperr.NewRule("That upload failed.")
	}
	photo, err := upload(formFile(form, "image"))
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var replaced []string
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		item, err := q.MenuItemInShop(ctx, store.MenuItemInShopParams{ShopID: o.Shop.ID, ID: paramID(c)})
		if err != nil {
			return err
		}
		replaced, err = domain.SetItemImage(ctx, q, s.Files, item.ID, photo)
		return err
	})
	if err != nil {
		return err
	}
	s.deleteFiles(ctx, replaced)
	return notice(c, "Photo saved.", nil)
}

func (s *Server) removeItemImage(c *echo.Context) error {
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
		item, err := q.MenuItemInShop(ctx, store.MenuItemInShopParams{ShopID: o.Shop.ID, ID: paramID(c)})
		if err != nil {
			return err
		}
		gone, err = domain.RemoveItemImage(ctx, q, item.ID)
		return err
	})
	if err != nil {
		return err
	}
	s.deleteFiles(ctx, gone)
	return notice(c, "Photo removed.", nil)
}

// itemImage serves an item's photo to anyone: it is shown on the shop's
// page. Only item and shop photos come this way — nothing else stored is
// public. A new photo is a new attachment, so the URL can be cached for good.
func (s *Server) itemImage(c *echo.Context) error { return s.publicPhoto(c, domain.MenuItemRecordType) }

// shopPhoto serves a shop's photo to anyone, for its page and the homepage.
func (s *Server) shopPhoto(c *echo.Context) error { return s.publicPhoto(c, domain.ShopRecordType) }

func (s *Server) publicPhoto(c *echo.Context, recordType string) error {
	ctx := c.Request().Context()
	row, err := s.Q.AttachmentWithBlob(ctx, paramID(c))
	if err != nil {
		return err
	}
	if row.RecordType != recordType {
		return apperr.ErrNotFound
	}
	data, err := s.Files.Get(ctx, row.Key)
	if err != nil {
		slog.Error("item photo is missing", "key", row.Key, "error", err)
		return apperr.NewNotFound("That photo is missing.")
	}
	c.Response().Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	return c.Blob(http.StatusOK, util.Deref(row.ContentType), data)
}

// deleteFiles lets go of files whose rows a committed transaction removed.
// A file left behind costs disk, never correctness, so failures are logged.
func (s *Server) deleteFiles(ctx context.Context, keys []string) {
	for _, key := range keys {
		if err := s.Files.Delete(ctx, key); err != nil {
			slog.Warn("could not delete a file", "key", key, "error", err)
		}
	}
}

func itemIDs(items []store.MenuItem) []int64 {
	ids := make([]int64, len(items))
	for i, item := range items {
		ids[i] = item.ID
	}
	return ids
}
