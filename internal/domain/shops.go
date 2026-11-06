package domain

import (
	"context"
	"slices"
	"strings"
	"unicode/utf8"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// A shop's profile: what customers read above its items. Only the name is
// required; the rest is there when the owner fills it in.

const (
	maxShopNameRunes  = 80
	maxShopAboutRunes = 300
	maxShopLineRunes  = 120
)

type ShopProfile struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Kind      *string `json:"kind"`
	KindLabel string  `json:"kind_label"`
	About     *string `json:"about"`
	Location  *string `json:"location"`
	Phone     *string `json:"phone"`
	Hours     *string `json:"hours"`
	// Where the pin is on the map; both or neither.
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
	PhotoURL  *string  `json:"photo_url"`
}

// ShopProfileView is the profile with its photo, from ShopPhotoURLs.
func ShopProfileView(s store.Shop, photos map[int64]string) ShopProfile {
	return ShopProfile{
		ID: s.ID, Name: s.Name, Kind: s.Kind, KindLabel: ShopKindLabel(s.Kind), About: s.About, Location: s.Location, Phone: s.Phone, Hours: s.Hours,
		Latitude: s.Latitude, Longitude: s.Longitude, PhotoURL: optionalURL(photos, s.ID),
	}
}

type ShopProfileInput struct {
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	About    string `json:"about"`
	Location string `json:"location"`
	Phone    string `json:"phone"`
	Hours    string `json:"hours"`
	// A pin on the map, or none: both or neither.
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

// UpdateShopProfile checks and saves what the owner wrote.
func UpdateShopProfile(ctx context.Context, q *store.Queries, shopID int64, in ShopProfileInput) error {
	name := strings.TrimSpace(in.Name)
	var errs apperr.Errors
	errs.Check(name != "", "Shop name can't be blank")
	errs.Check(utf8.RuneCountInString(name) <= maxShopNameRunes, "Shop name is too long (at most 80 characters)")
	errs.Check(in.Kind == "" || slices.ContainsFunc(ShopKinds, func(k ShopKind) bool { return k.Key == in.Kind }), "Choose one of the types listed")
	errs.Check(utf8.RuneCountInString(strings.TrimSpace(in.About)) <= maxShopAboutRunes, "About is too long (at most 300 characters)")
	errs.Check(utf8.RuneCountInString(strings.TrimSpace(in.Location)) <= maxShopLineRunes, "Location is too long (at most 120 characters)")
	errs.Check(utf8.RuneCountInString(strings.TrimSpace(in.Hours)) <= maxShopLineRunes, "Opening hours are too long (at most 120 characters)")
	// A landline here is 7 digits with its area code, a mobile 8.
	digits := len(NormalizePhone(in.Phone))
	errs.Check(strings.TrimSpace(in.Phone) == "" || (digits >= 7 && digits <= 15), "Phone doesn't look like a phone number")
	pinned := in.Latitude != nil && in.Longitude != nil
	errs.Check(pinned || (in.Latitude == nil && in.Longitude == nil), "Place the pin on the map, or clear it")
	errs.Check(!pinned || (*in.Latitude >= -90 && *in.Latitude <= 90 && *in.Longitude >= -180 && *in.Longitude <= 180), "That pin is not on the map")
	if err := errs.Err(); err != nil {
		return err
	}
	return q.UpdateShopProfile(ctx, store.UpdateShopProfileParams{
		ID: shopID, Name: name, Kind: util.Presence(in.Kind), About: util.Presence(in.About),
		Location: util.Presence(in.Location), Phone: util.Presence(in.Phone), Hours: util.Presence(in.Hours),
		Latitude: in.Latitude, Longitude: in.Longitude,
	})
}
