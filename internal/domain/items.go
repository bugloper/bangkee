package domain

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"bangkee/internal/apperr"
	"bangkee/internal/money"
	"bangkee/internal/storage"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Items: what a shop sells, with a price and optionally a photo. The owner
// picks from them when recording a credit; customers browse them on the
// shop's page.

// ------------------------------------------------------------------- menu

const Ungrouped = "Everything else"

type MenuItemDTO struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Category   *string `json:"category"`
	PriceCents int64   `json:"price_cents"`
	Price      string  `json:"price"`
	Available  bool    `json:"available"`
	Position   int32   `json:"position"`
	ImageURL   *string `json:"image_url"` // a photo of it, when the shop added one
}

// MenuItemView: images maps item ids to their photo's URL (ItemImageURLs).
func MenuItemView(m store.MenuItem, images map[int64]string) MenuItemDTO {
	return MenuItemDTO{ID: m.ID, Name: m.Name, Category: m.Category, PriceCents: m.PriceCents,
		Price: money.MajorUnits(m.PriceCents), Available: m.Available, Position: m.Position, ImageURL: optionalURL(images, m.ID)}
}

// ------------------------------------------------------------ item images
//
// An item may have one photo. Shop pages show it to every customer, so
// these are served publicly, unlike payment screenshots.

const (
	MenuItemRecordType = "MenuItem"
	ItemImageName      = "image"
)

// ItemImageTypes are the photos every phone's browser can show: no HEIC,
// which most cannot. The app converts a photo to JPEG before it uploads.
var ItemImageTypes = []string{"image/png", "image/jpeg", "image/webp"}

// MaxItemImageBytes: the app shrinks photos well below this before sending.
const MaxItemImageBytes = 3 * 1024 * 1024

func ItemImageURL(attachmentID int64) string {
	return fmt.Sprintf("/api/public/item_images/%d", attachmentID)
}

// ItemImageURLs maps each item to its photo's URL.
func ItemImageURLs(ctx context.Context, q *store.Queries, itemIDs []int64) (map[int64]string, error) {
	rows, err := q.AttachmentIDs(ctx, store.AttachmentIDsParams{RecordType: MenuItemRecordType, RecordIds: itemIDs, Name: ItemImageName})
	if err != nil {
		return nil, err
	}
	out := map[int64]string{}
	for _, row := range rows {
		out[row.RecordID] = ItemImageURL(row.ID) // the newest wins: rows come oldest first
	}
	return out, nil
}

// SetItemImage puts a photo on an item, replacing any it had. It returns
// the replaced files' keys, to delete once the transaction has committed.
func SetItemImage(ctx context.Context, q *store.Queries, files *storage.Storage, itemID int64, upload *Upload) ([]string, error) {
	var errs apperr.Errors
	if upload == nil {
		errs.Add("Photo must be attached")
	} else {
		errs.Check(slices.Contains(ItemImageTypes, upload.ContentType), "Photo must be a PNG, JPEG or WebP image")
		errs.Check(len(upload.Data) <= MaxItemImageBytes, "Photo must be smaller than 3 MB")
	}
	if err := errs.Err(); err != nil {
		return nil, err
	}
	old, err := RemoveItemImage(ctx, q, itemID)
	if err != nil {
		return nil, err
	}
	blobID, err := CreateBlob(ctx, q, files, *upload)
	if err != nil {
		return nil, err
	}
	return old, Attach(ctx, q, MenuItemRecordType, itemID, ItemImageName, blobID)
}

// RemoveItemImage takes an item's photo off, returning the files' keys to
// delete once the transaction has committed.
func RemoveItemImage(ctx context.Context, q *store.Queries, itemID int64) ([]string, error) {
	return detachFiles(ctx, q, MenuItemRecordType, []int64{itemID}, ItemImageName)
}

type MenuGroup struct {
	Category string
	Items    []store.MenuItem
}

// GroupMenu groups a shop's items for customers, in the shop's order,
// ungrouped items last.
func GroupMenu(items []store.MenuItem) []MenuGroup {
	var groups []MenuGroup
	for _, item := range items {
		category := Ungrouped
		if item.Category != nil && *item.Category != "" {
			category = *item.Category
		}
		found := false
		for i := range groups {
			if groups[i].Category == category {
				groups[i].Items = append(groups[i].Items, item)
				found = true
			}
		}
		if !found {
			groups = append(groups, MenuGroup{category, []store.MenuItem{item}})
		}
	}
	// Stable: everything keeps its order, ungrouped moves to the end.
	var named, rest []MenuGroup
	for _, g := range groups {
		if g.Category == Ungrouped {
			rest = append(rest, g)
		} else {
			named = append(named, g)
		}
	}
	return append(named, rest...)
}

type MenuItemInput struct {
	Name      string `json:"name"`
	Category  string `json:"category"`
	Price     string `json:"price"`
	Available bool   `json:"available"`
	Position  *int32 `json:"position"`
}

func validateMenuItem(ctx context.Context, q *store.Queries, shopID int64, exceptID *int64, in MenuItemInput) (int64, error) {
	var errs apperr.Errors
	if !util.Present(in.Name) {
		errs.Add("Name can't be blank")
	} else {
		taken, err := q.MenuItemNameTaken(ctx, store.MenuItemNameTakenParams{ShopID: shopID, Name: strings.TrimSpace(in.Name), ExceptID: exceptID})
		if err != nil {
			return 0, err
		}
		errs.Check(!taken, "Name has already been taken")
	}
	price, ok := money.ParseCents(in.Price)
	switch {
	case !ok:
		errs.Add("Price is not a number")
	case price < 0:
		errs.Add("Price must be greater than or equal to 0")
	}
	return price, errs.Err()
}

// SaveMenuItem creates (item nil) or updates, returning the saved name.
// SaveMenuItem returns the item's id — a new one's, so a photo can follow —
// and its name.
func SaveMenuItem(ctx context.Context, q *store.Queries, shopID int64, item *store.MenuItem, in MenuItemInput) (int64, string, error) {
	var exceptID *int64
	if item != nil {
		exceptID = &item.ID
	}
	price, err := validateMenuItem(ctx, q, shopID, exceptID, in)
	if err != nil {
		return 0, "", err
	}
	name := strings.TrimSpace(in.Name)
	if item == nil {
		position := int32(0)
		if in.Position != nil {
			position = *in.Position
		}
		id, err := q.CreateMenuItem(ctx, store.CreateMenuItemParams{
			ShopID: shopID, Name: name, Category: util.Presence(in.Category), PriceCents: price, Available: in.Available, Position: position,
		})
		return id, name, err
	}
	position := item.Position
	if in.Position != nil {
		position = *in.Position
	}
	return item.ID, name, q.UpdateMenuItem(ctx, store.UpdateMenuItemParams{
		ID: item.ID, Name: name, Category: util.Presence(in.Category), PriceCents: price, Available: in.Available, Position: position,
	})
}

// DestroyMenuItem: credits already recorded keep their own copy of the name
// and price, so nothing in the book changes. Its photo goes with it: the
// keys returned are the files to delete once the transaction has committed.
func DestroyMenuItem(ctx context.Context, q *store.Queries, item store.MenuItem) ([]string, error) {
	keys, err := RemoveItemImage(ctx, q, item.ID)
	if err != nil {
		return nil, err
	}
	return keys, q.DeleteMenuItem(ctx, item.ID)
}
