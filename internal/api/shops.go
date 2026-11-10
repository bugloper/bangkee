package api

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// The shops catalog: customers browse Bangkee's shops by type and read each
// one's items and prices. Ordering happens at the counter, not here.

// menuFor is a shop's items, grouped as the customer reads them. Items the
// shop has marked out of stock, or has none left of, stay listed, so a
// customer can see that.
func (s *Server) menuFor(ctx context.Context, shopID int64) ([]M, error) {
	items, err := s.Q.MenuItemsOrdered(ctx, store.MenuItemsOrderedParams{ShopID: shopID, AvailableOnly: false})
	if err != nil {
		return nil, err
	}
	images, err := domain.ItemImageURLs(ctx, s.Q, itemIDs(items))
	if err != nil {
		return nil, err
	}
	menu := []M{}
	for _, group := range domain.GroupMenu(items) {
		lines := make([]M, 0, len(group.Items))
		for _, item := range group.Items {
			var image *string
			if url, ok := images[item.ID]; ok {
				image = &url
			}
			// A counted item reads "Only 3 left" when running low and is out of
			// stock at 0; the count itself, and anything else about stock, stays the shop's.
			var left *int32
			if item.Stock != nil && *item.Stock > 0 && *item.Stock <= domain.LowLevel(item.LowStockAt) {
				left = item.Stock
			}
			lines = append(lines, M{"id": item.ID, "name": item.Name, "price_cents": item.PriceCents, "available": item.Available && !domain.SoldOut(item), "left": left, "image_url": image})
		}
		menu = append(menu, M{"category": group.Category, "items": lines})
	}
	return menu, nil
}

// shopDirectory is every shop with items to show, by type and name, and
// the signed-in customer's own shops whether they list items or not.
func (s *Server) shopDirectory(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	return s.directory(c, &cur.User.ID)
}

// publicShopDirectory is the list for the homepage, signed in or not: only
// shops with items, as what a shop shows is its own advertisement.
func (s *Server) publicShopDirectory(c *echo.Context) error { return s.directory(c, nil) }

func (s *Server) directory(c *echo.Context, customer *int64) error {
	kind := util.Presence(c.QueryParam("kind"))
	search := util.Presence(c.QueryParam("q"))
	rows, err := s.Q.ShopDirectory(c.Request().Context(), store.ShopDirectoryParams{Kind: kind, Search: search, Customer: customer})
	if err != nil {
		return err
	}
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	photos, err := domain.ShopPhotoURLs(c.Request().Context(), s.Q, ids)
	if err != nil {
		return err
	}
	shops := make([]M, 0, len(rows))
	for _, row := range rows {
		shops = append(shops, M{
			"id": row.ID, "name": row.Name, "kind": row.Kind, "kind_label": domain.ShopKindLabel(row.Kind),
			"location": row.Location, "items_count": row.ItemsCount, "photo_url": domain.PhotoURL(photos, &row.ID),
			"latitude": row.Latitude, "longitude": row.Longitude, "yours": row.Yours,
		})
	}
	return c.JSON(http.StatusOK, M{"shops": shops, "kinds": domain.ShopKinds})
}

// shopPage is one shop's profile and items as a customer reads them. Its
// owner sees it too, as a preview, even before listing anything.
func (s *Server) shopPage(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	return s.page(c, &cur.User.ID)
}

// publicShopPage is a shop's page for anyone, signed in or not.
func (s *Server) publicShopPage(c *echo.Context) error { return s.page(c, nil) }

// page is a shop's profile and items; viewer is who is looking, when signed in.
func (s *Server) page(c *echo.Context, viewer *int64) error {
	ctx := c.Request().Context()
	shop, err := s.Q.ShopByID(ctx, paramID(c))
	if err != nil {
		return err
	}
	menu, err := s.menuFor(ctx, shop.ID)
	if err != nil {
		return err
	}
	mine := viewer != nil && shop.OwnerID == *viewer
	// A shop with nothing listed has no public page — except to its owner,
	// and to the customers in its book.
	if len(menu) == 0 && !mine {
		customer := false
		if viewer != nil {
			if customer, err = s.Q.CustomerOfShop(ctx, store.CustomerOfShopParams{ShopID: shop.ID, CustomerID: viewer}); err != nil {
				return err
			}
		}
		if !customer {
			return apperr.ErrNotFound
		}
	}
	view, err := s.shopProfileView(ctx, shop)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"shop": view, "menu": menu, "mine": mine})
}

// shopProfile is the owner's own profile, to edit.
func (s *Server) shopProfile(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	view, err := s.shopProfileView(c.Request().Context(), o.Shop)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"shop": view, "kinds": domain.ShopKinds})
}

func (s *Server) shopProfileView(ctx context.Context, shop store.Shop) (domain.ShopProfile, error) {
	photos, err := domain.ShopPhotoURLs(ctx, s.Q, []int64{shop.ID})
	return domain.ShopProfileView(shop, photos), err
}

func (s *Server) updateShopProfile(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.ShopProfileInput
	if err := decode(c, &in); err != nil {
		return err
	}
	if err := domain.UpdateShopProfile(c.Request().Context(), s.Q, o.Shop.ID, in); err != nil {
		return err
	}
	return notice(c, "Shop profile saved.", nil)
}
