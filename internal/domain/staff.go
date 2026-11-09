package domain

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Staff: the people who work in a shop besides its owner. Each signs in as
// themselves, so every entry says who recorded it, and each has a role that
// says what they may do. The owner alone handles what is sensitive — where
// customers send money (bank details), billing, the shop's profile and
// settings, removing customers, and the staff themselves.
//
// What each role may do is decided in one place on the server: the API
// asks Can(role, permission) for every request a staff member makes (see
// api/staff.go), and anything not explicitly allowed is refused.

const (
	StaffManager = "manager"
	StaffCashier = "cashier"
	StaffViewer  = "viewer"
	// The owner, when a role is asked of them.
	ShopOwnerRole = "owner"
)

var StaffRoles = []string{StaffManager, StaffCashier, StaffViewer}

var StaffRoleNames = map[string]string{StaffManager: "Manager", StaffCashier: "Cashier", StaffViewer: "Read only", ShopOwnerRole: "Owner"}

type Permission string

const (
	// PermView: read the book — customers, entries, statements, suppliers.
	PermView Permission = "view"
	// PermRecord: add customers, record credits and payments, attach files.
	PermRecord Permission = "record"
	// PermManage: change and cross out entries, plans, reminders, items, suppliers.
	PermManage Permission = "manage"
	// PermOwner: never granted to staff.
	PermOwner Permission = "owner"
)

// Can is the whole of what each role may do.
func Can(role string, p Permission) bool {
	switch role {
	case ShopOwnerRole:
		return true
	case StaffManager:
		return p == PermView || p == PermRecord || p == PermManage
	case StaffCashier:
		return p == PermView || p == PermRecord
	case StaffViewer:
		return p == PermView
	}
	return false
}

// Permissions lists what a role may do, for the app to show the right buttons.
func Permissions(role string) []Permission {
	out := []Permission{}
	for _, p := range []Permission{PermView, PermRecord, PermManage, PermOwner} {
		if Can(role, p) {
			out = append(out, p)
		}
	}
	return out
}

// Membership is a staff member's place in a shop.
type Membership struct {
	Member store.ShopMember
	Shop   store.Shop
}

func ActiveMembership(ctx context.Context, q *store.Queries, userID int64) (*Membership, error) {
	row, err := q.ActiveMembership(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &Membership{Member: row.ShopMember, Shop: row.Shop}, nil
}

const staffInvitationLifetime = 7 * 24 * time.Hour

type StaffInvitationInput struct {
	Name         string `json:"name"`
	EmailAddress string `json:"email_address"`
	Role         string `json:"role"`
}

func knownStaffRole(role string) bool {
	for _, r := range StaffRoles {
		if r == role {
			return true
		}
	}
	return false
}

// InviteStaff opens an invitation, holding one of the plan's staff places
// until it is used, withdrawn or expires.
func InviteStaff(ctx context.Context, q *store.Queries, shop store.Shop, by int64, in StaffInvitationInput, maxStaff int, now time.Time) (store.StaffInvitation, error) {
	var errs apperr.Errors
	name := strings.TrimSpace(in.Name)
	email := NormalizeEmail(in.EmailAddress)
	errs.Check(name != "", "Name can't be blank")
	errs.Check(strings.Contains(email, "@") && strings.Contains(email, "."), "Email address is not valid")
	errs.Check(knownStaffRole(in.Role), "Choose a role: manager, cashier or read only")
	if err := errs.Err(); err != nil {
		return store.StaffInvitation{}, err
	}
	if existing, err := UserByEmail(ctx, q, email); err != nil {
		return store.StaffInvitation{}, err
	} else if existing != nil {
		return store.StaffInvitation{}, apperr.NewRule("That email already has a Bangkee login. Staff join with an email of their own that is new to Bangkee.")
	}
	taken, err := q.StaffSeatsTaken(ctx, shop.ID)
	if err != nil {
		return store.StaffInvitation{}, err
	}
	if taken >= int64(maxStaff) {
		return store.StaffInvitation{}, apperr.NewRule("Your plan has room for " + util.Itoa(maxStaff) + " staff. Remove someone, or withdraw an invitation, first.")
	}
	invitation, err := q.CreateStaffInvitation(ctx, store.CreateStaffInvitationParams{
		ShopID: shop.ID, Name: name, EmailAddress: email, Role: in.Role, Token: util.SecureToken(), InvitedByID: by, ExpiresAt: now.Add(staffInvitationLifetime),
	})
	if err != nil {
		return invitation, err
	}
	return invitation, Audit(ctx, q, "Shop", shop.ID, "staff_invited", &by, map[string]any{"email": email, "role": in.Role})
}

// StaffInvitation is an open invitation, found by its link.
func StaffInvitation(ctx context.Context, q *store.Queries, token string, now time.Time) (store.StaffInvitationByTokenRow, error) {
	row, err := q.StaffInvitationByToken(ctx, token)
	if errors.Is(err, pgx.ErrNoRows) {
		return row, apperr.NewNotFound("That invitation link is not valid.")
	}
	if err != nil {
		return row, err
	}
	i := row.StaffInvitation
	switch {
	case i.AcceptedAt != nil:
		return row, apperr.NewRule("That invitation has already been used. Sign in instead.")
	case i.RevokedAt != nil:
		return row, apperr.NewRule("The shop withdrew that invitation.")
	case !i.ExpiresAt.After(now):
		return row, apperr.NewRule("That invitation has expired. Ask the shop for a new one.")
	}
	return row, nil
}

// AcceptStaffInvitation creates the staff member's login and puts them in
// the shop. The invitation is used up in the same transaction, so a link
// opened twice makes one login.
func AcceptStaffInvitation(ctx context.Context, q *store.Queries, token, name, password string, now time.Time) (store.User, error) {
	row, err := StaffInvitation(ctx, q, token, now)
	if err != nil {
		return store.User{}, err
	}
	i := row.StaffInvitation
	used, err := q.AcceptStaffInvitation(ctx, i.ID)
	if err != nil {
		return store.User{}, err
	}
	if used == 0 {
		return store.User{}, apperr.NewRule("That invitation has already been used. Sign in instead.")
	}
	if strings.TrimSpace(name) == "" {
		name = i.Name
	}
	var errs apperr.Errors
	errs.Check(len(password) >= 8, "Password must be at least 8 characters")
	if err := errs.Err(); err != nil {
		return store.User{}, err
	}
	user, err := CreateUser(ctx, q, NewUser{Name: strings.TrimSpace(name), EmailAddress: i.EmailAddress, Password: password, Role: RoleStaff})
	if err != nil {
		return user, err
	}
	if _, err := q.CreateMember(ctx, store.CreateMemberParams{ShopID: i.ShopID, UserID: user.ID, Role: i.Role, InvitedByID: &i.InvitedByID}); err != nil {
		return user, err
	}
	return user, Audit(ctx, q, "Shop", i.ShopID, "staff_joined", &user.ID, map[string]any{"role": i.Role})
}

func ChangeStaffRole(ctx context.Context, q *store.Queries, member store.ShopMember, role string, by int64) error {
	if !knownStaffRole(role) {
		return apperr.NewValidation("Choose a role: manager, cashier or read only")
	}
	if err := q.SetMemberRole(ctx, store.SetMemberRoleParams{ID: member.ID, Role: role}); err != nil {
		return err
	}
	return Audit(ctx, q, "Shop", member.ShopID, "staff_role_changed", &by, map[string]any{"user_id": member.UserID, "from": member.Role, "to": role})
}

// RemoveStaff takes someone off the staff and signs them out everywhere.
// Their entries keep their name.
func RemoveStaff(ctx context.Context, q *store.Queries, member store.ShopMember, by int64) error {
	revoked, err := q.RevokeMember(ctx, store.RevokeMemberParams{ID: member.ID, RevokedByID: &by})
	if err != nil {
		return err
	}
	if revoked == 0 {
		return apperr.NewRule("They are no longer on your staff.")
	}
	if err := q.DeleteUserSessions(ctx, member.UserID); err != nil {
		return err
	}
	return Audit(ctx, q, "Shop", member.ShopID, "staff_removed", &by, map[string]any{"user_id": member.UserID})
}
