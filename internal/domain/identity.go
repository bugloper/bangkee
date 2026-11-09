// Package domain is Bangkee's business rules — what the Rails models did —
// written against the generated queries in internal/store. Every function
// takes the *store.Queries it should run on, so a handler decides whether a
// piece of work happens inside a transaction.
package domain

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

const (
	RoleShopOwner int32 = 0
	RoleCustomer  int32 = 1
	// RoleStaff works in someone else's shop (see staff.go).
	RoleStaff int32 = 2
)

var Locales = []string{"en", "dz"}

type UserDTO struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	EmailAddress  *string `json:"email_address"` // nil for a customer who joined with phone and PIN
	Phone         *string `json:"phone"`
	Role          string  `json:"role"`
	PlatformAdmin bool    `json:"platform_admin"`
	Locale        *string `json:"locale"`
	DisplayName   string  `json:"display_name"`
	Initial       string  `json:"initial"`
	PhotoURL      *string `json:"photo_url"` // their profile photo, if they added one
	// RemindersOptOut: a customer who asked Bangkee not to remind them what they owe.
	RemindersOptOut bool `json:"reminders_opt_out"`
}

func DisplayName(u store.User) string {
	switch {
	case strings.TrimSpace(u.Name) != "":
		return u.Name
	case u.EmailAddress != nil:
		return *u.EmailAddress
	case u.Phone != nil:
		return *u.Phone
	}
	return "Customer"
}

// ReadingLocale: nil means "follow the app default"; an unknown value is
// ignored rather than trusted, so a stale row cannot break every page.
func ReadingLocale(u store.User) *string {
	if u.Locale == nil {
		return nil
	}
	for _, locale := range Locales {
		if *u.Locale == locale {
			return u.Locale
		}
	}
	return nil
}

func UserView(u store.User) UserDTO {
	role := "customer"
	switch u.Role {
	case RoleShopOwner:
		role = "shop_owner"
	case RoleStaff:
		role = "staff"
	}
	return UserDTO{
		ID: u.ID, Name: u.Name, EmailAddress: u.EmailAddress, Phone: u.Phone, Role: role,
		PlatformAdmin: u.PlatformAdmin, Locale: ReadingLocale(u), DisplayName: DisplayName(u),
		Initial: util.FirstUpper(DisplayName(u)), RemindersOptOut: u.RemindersOptOut,
	}
}

func NormalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func UserByEmail(ctx context.Context, q *store.Queries, email string) (*store.User, error) {
	normalized := NormalizeEmail(email)
	user, err := q.UserByEmail(ctx, &normalized)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &user, err
}

// Authenticate is `User.authenticate_by`: a missing account and a wrong
// password look the same. Rails' has_secure_password wrote standard bcrypt,
// so every existing account signs in with the password it already has.
func Authenticate(ctx context.Context, q *store.Queries, email, password string) (*store.User, error) {
	user, err := UserByEmail(ctx, q, email)
	if err != nil || user == nil {
		return nil, err
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordDigest), []byte(password)) != nil {
		return nil, nil
	}
	return user, nil
}

func HashPassword(password string) (string, error) {
	digest, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(digest), err
}

type NewUser struct {
	Name, EmailAddress, Phone, Password string
	Role                                int32
}

// CreateUser applies has_secure_password's rules plus the model's own: a
// name, a unique email, a password no longer than bcrypt can hold.
func CreateUser(ctx context.Context, q *store.Queries, in NewUser) (store.User, error) {
	var errs apperr.Errors
	errs.Check(util.Present(in.Name), "Name can't be blank")
	if !util.Present(in.EmailAddress) {
		errs.Add("Email address can't be blank")
	} else if existing, err := UserByEmail(ctx, q, in.EmailAddress); err != nil {
		return store.User{}, err
	} else if existing != nil {
		errs.Add("Email address has already been taken")
	}
	switch {
	case in.Password == "":
		errs.Add("Password can't be blank")
	case len(in.Password) > 72:
		errs.Add("Password is too long (maximum is 72 characters)")
	}
	if err := errs.Err(); err != nil {
		return store.User{}, err
	}

	digest, err := HashPassword(in.Password)
	if err != nil {
		return store.User{}, err
	}
	id, err := q.CreateUser(ctx, store.CreateUserParams{
		Name: strings.TrimSpace(in.Name), EmailAddress: util.Ptr(NormalizeEmail(in.EmailAddress)),
		Phone: util.Presence(in.Phone), PasswordDigest: digest, Role: in.Role,
	})
	if err != nil {
		return store.User{}, err
	}
	return q.UserByID(ctx, id)
}

// ------------------------------------------------- phone and PIN customers

// NormalizePhone is bangkee_phone() in Go: digits only, without Bhutan's 975
// in front, so "17 61 23 45" and "+975 17612345" are one phone.
func NormalizePhone(phone string) string {
	var digits strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	d := digits.String()
	if len(d) == 11 && strings.HasPrefix(d, "975") {
		return d[3:]
	}
	return d
}

// ValidPhone: a Bhutanese mobile is 8 digits; a number from abroad, with its
// country code, up to 15.
func ValidPhone(phone string) bool {
	n := len(NormalizePhone(phone))
	return n >= 8 && n <= 15
}

// ValidPIN is four digits.
func ValidPIN(pin string) bool {
	if len(pin) != 4 {
		return false
	}
	for _, r := range pin {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// CustomerByPhone is who signs in with this phone, nil when nobody does.
func CustomerByPhone(ctx context.Context, q *store.Queries, phone string) (*store.User, error) {
	normalized := NormalizePhone(phone)
	if normalized == "" {
		return nil, nil
	}
	user, err := q.CustomerByPhone(ctx, normalized)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &user, err
}

// AuthenticateByPhone: phone and PIN, or phone and password for a customer
// who also has one. A missing customer and a wrong PIN look the same.
func AuthenticateByPhone(ctx context.Context, q *store.Queries, phone, secret string) (*store.User, error) {
	user, err := CustomerByPhone(ctx, q, phone)
	if err != nil || user == nil {
		return nil, err
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordDigest), []byte(secret)) != nil {
		return nil, nil
	}
	return user, nil
}

// CreatePinCustomer: someone joining from an invite with only their name;
// the phone is the one the shop sent the link to.
func CreatePinCustomer(ctx context.Context, q *store.Queries, name, phone, pin string) (store.User, error) {
	var errs apperr.Errors
	errs.Check(util.Present(name), "Name can't be blank")
	errs.Check(ValidPIN(pin), "PIN must be 4 digits")
	if err := errs.Err(); err != nil {
		return store.User{}, err
	}
	digest, err := HashPassword(pin)
	if err != nil {
		return store.User{}, err
	}
	normalized := NormalizePhone(phone)
	id, err := q.CreatePinCustomer(ctx, store.CreatePinCustomerParams{Name: strings.TrimSpace(name), Phone: &normalized, PasswordDigest: digest})
	if err != nil {
		return store.User{}, err
	}
	return q.UserByID(ctx, id)
}

// ------------------------------------------------------------------- shops

type ShopRef struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	CreditDueDays int32   `json:"credit_due_days"`
	Kind          *string `json:"kind"` // a ShopKinds key; nil until the owner picks one
}

func ShopView(s store.Shop) ShopRef {
	return ShopRef{ID: s.ID, Name: s.Name, CreditDueDays: s.CreditDueDays, Kind: s.Kind}
}

// ShopKind is a sort of business customers browse by.
type ShopKind struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// The keys are stored; new kinds go anywhere in the list, "other" stays last.
var ShopKinds = []ShopKind{
	{"restaurant", "Restaurant"}, {"cafe", "Café"}, {"bakery", "Bakery"}, {"bar", "Bar"}, {"snooker", "Snooker"},
	{"grocery", "Grocery"}, {"general_store", "General store"}, {"vegetables", "Vegetables & fruits"}, {"meat", "Meat shop"},
	{"pharmacy", "Pharmacy"}, {"hardware", "Hardware"}, {"electronics", "Electronics & mobile"},
	{"clothing", "Clothing & shoes"}, {"tailor", "Tailor"}, {"salon", "Salon & beauty"},
	{"stationery", "Stationery & books"}, {"hotel", "Hotel & homestay"}, {"fuel", "Fuel & gas"},
	{"other", "Other"},
}

// ShopKindLabel is how a kind reads; a shop that has not picked one is "Shop".
func ShopKindLabel(kind *string) string {
	if kind != nil {
		for _, k := range ShopKinds {
			if k.Key == *kind {
				return k.Label
			}
		}
	}
	return "Shop"
}

// ShopForOwner: a shop owner owns one shop in this version (`User#shop`).
func ShopForOwner(ctx context.Context, q *store.Queries, ownerID int64) (*store.Shop, error) {
	shop, err := q.ShopForOwner(ctx, ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &shop, err
}

// CreateShop opens a shop, billable from the moment it exists (BR-36), at
// the current monthly price.
func CreateShop(ctx context.Context, q *store.Queries, ownerID int64, name string, priceCents int64) (int64, error) {
	id, err := q.CreateShop(ctx, store.CreateShopParams{OwnerID: ownerID, Name: name})
	if err != nil {
		return 0, err
	}
	periodEnd := time.Now().UTC().AddDate(0, TrialMonths, 0)
	err = q.ProvisionSubscription(ctx, store.ProvisionSubscriptionParams{
		ShopID: id, CurrentPeriodEnd: periodEnd, GraceUntil: util.Ptr(periodEnd.AddDate(0, 0, GraceDays)), PriceCents: priceCents,
	})
	return id, err
}

// ------------------------------------------------------------------- audit

// Audit appends to the trail (BR-17). Events are written explicitly with
// their own metadata rather than derived from column diffs, so the log says
// what happened in domain terms ("crossed_out"), not which columns moved.
// auditableType holds the Rails class name so rows from either server read
// the same.
func Audit(ctx context.Context, q *store.Queries, auditableType string, id int64, action string, actor *int64, metadata map[string]any) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	encoded, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	return q.CreateAuditEvent(ctx, store.CreateAuditEventParams{
		AuditableType: auditableType, AuditableID: id, Action: action, ActorID: actor, Metadata: encoded,
	})
}

type AuditEventDTO struct {
	ID          int64     `json:"id"`
	Action      string    `json:"action"`
	ActorName   string    `json:"actor_name"`
	CreatedAt   time.Time `json:"created_at"`
	AmountCents *int64    `json:"amount_cents"`
}

func RecentAudit(ctx context.Context, q *store.Queries, auditableType string, id int64, limit int32) ([]AuditEventDTO, error) {
	rows, err := q.RecentAuditEvents(ctx, store.RecentAuditEventsParams{AuditableType: auditableType, AuditableID: id, Limit: limit})
	if err != nil {
		return nil, err
	}
	out := make([]AuditEventDTO, 0, len(rows))
	for _, row := range rows {
		var metadata struct {
			AmountCents *int64 `json:"amount_cents"`
		}
		_ = json.Unmarshal(row.Metadata, &metadata)
		actor := "System" // BR-18: an event with no actor was the system's doing.
		if row.ActorName != nil {
			actor = *row.ActorName
		}
		out = append(out, AuditEventDTO{ID: row.ID, Action: row.Action, ActorName: actor, CreatedAt: row.CreatedAt, AmountCents: metadata.AmountCents})
	}
	return out, nil
}
