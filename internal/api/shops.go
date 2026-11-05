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
// shop has marked out of stock stay listed, so a customer can see that.
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
			lines = append(lines, M{"id": item.ID, "name": item.Name, "price_cents": item.PriceCents, "available": item.Available, "image_url": image})
		}
		menu = append(menu, M{"category": group.Category, "items": lines})
	}
	return menu, nil
}

// shopDirectory is every shop with items to show, by type and name.
func (s *Server) shopDirectory(c *echo.Context) error {
	if _, err := s.currentUser(c); err != nil {
		return err
	}
	kind := util.Presence(c.QueryParam("kind"))
	search := util.Presence(c.QueryParam("q"))
	rows, err := s.Q.ShopDirectory(c.Request().Context(), store.ShopDirectoryParams{Kind: kind, Search: search})
	if err != nil {
		return err
	}
	shops := make([]M, 0, len(rows))
	for _, row := range rows {
		shops = append(shops, M{
			"id": row.ID, "name": row.Name, "kind": row.Kind, "kind_label": domain.ShopKindLabel(row.Kind),
			"location": row.Location, "items_count": row.ItemsCount,
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
	ctx := c.Request().Context()
	shop, err := s.Q.ShopByID(ctx, paramID(c))
	if err != nil {
		return err
	}
	menu, err := s.menuFor(ctx, shop.ID)
	if err != nil {
		return err
	}
	mine := shop.OwnerID == cur.User.ID
	if len(menu) == 0 && !mine {
		return apperr.ErrNotFound
	}
	return c.JSON(http.StatusOK, M{"shop": domain.ShopProfileView(shop), "menu": menu, "mine": mine})
}

// shopProfile is the owner's own profile, to edit.
func (s *Server) shopProfile(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"shop": domain.ShopProfileView(o.Shop), "kinds": domain.ShopKinds})
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
