package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
)

// What a staff member may reach, endpoint by endpoint. An endpoint that is
// not listed is the owner's alone — bank details, billing, the shop's
// profile and settings, removing customers, the staff — so a new endpoint
// is closed to staff until someone decides otherwise.
var staffPermissions = map[string]domain.Permission{
	"GET /api/insights":                    domain.PermView,
	"GET /api/accounts":                    domain.PermView,
	"GET /api/transactions/:id":            domain.PermView,
	"GET /api/bank_accounts":               domain.PermView,
	"GET /api/menu_items":                  domain.PermView,
	"GET /api/menu_items/:id":              domain.PermView,
	"GET /api/accounts/:id/reminders":      domain.PermView,
	"GET /api/shop/reminders":              domain.PermView,
	"GET /api/suppliers":                   domain.PermView,
	"GET /api/suppliers/:id":               domain.PermView,
	"GET /api/suppliers/:id/statement":     domain.PermView,
	"GET /api/suppliers/:id/statement.pdf": domain.PermView,

	"POST /api/accounts":                                  domain.PermRecord,
	"GET /api/accounts/:id/invite":                        domain.PermRecord,
	"POST /api/accounts/:id/credits":                      domain.PermRecord,
	"POST /api/accounts/:id/payments":                     domain.PermRecord,
	"POST /api/transactions/:id/documents":                domain.PermRecord,
	"POST /api/accounts/:id/remind":                       domain.PermRecord,
	"POST /api/accounts/:id/reminders/log":                domain.PermRecord,
	"POST /api/suppliers/:id/purchases":                   domain.PermManage,
	"POST /api/suppliers/:id/payments":                    domain.PermManage,
	"PATCH /api/accounts/:id":                             domain.PermManage,
	"POST /api/accounts/:id/pin_reset":                    domain.PermManage,
	"PATCH /api/transactions/:id":                         domain.PermManage,
	"POST /api/transactions/:id/cross_out":                domain.PermManage,
	"DELETE /api/transactions/:id/documents/:document_id": domain.PermManage,
	"POST /api/transactions/:id/dispute_reply":            domain.PermManage,
	"POST /api/accounts/:id/installments":                 domain.PermManage,
	"POST /api/installment_plans/:id/cancel":              domain.PermManage,
	"PATCH /api/accounts/:id/reminders":                   domain.PermManage,
	"POST /api/reminders/overdue":                         domain.PermManage,
	"POST /api/menu_items":                                domain.PermManage,
	"PATCH /api/menu_items/:id":                           domain.PermManage,
	"POST /api/menu_items/:id/image":                      domain.PermManage,
	"DELETE /api/menu_items/:id/image":                    domain.PermManage,
	"DELETE /api/menu_items/:id":                          domain.PermManage,
	"POST /api/suppliers":                                 domain.PermManage,
	"PATCH /api/suppliers/:id":                            domain.PermManage,
	"DELETE /api/suppliers/:id":                           domain.PermManage,
	"POST /api/supplier_entries/:id/cross_out":            domain.PermManage,
}

func requiredPermission(c *echo.Context) domain.Permission {
	if p, ok := staffPermissions[c.Request().Method+" "+c.Path()]; ok {
		return p
	}
	return domain.PermOwner
}

// ------------------------------------------------------ the owner's screen

func (s *Server) staff(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	members, err := s.Q.ShopMembers(ctx, o.Shop.ID)
	if err != nil {
		return err
	}
	invitations, err := s.Q.PendingStaffInvitations(ctx, o.Shop.ID)
	if err != nil {
		return err
	}
	sub, err := domain.SubscriptionFor(ctx, s.Q, o.Shop.ID)
	if err != nil {
		return err
	}
	memberViews := make([]M, 0, len(members))
	for _, m := range members {
		memberViews = append(memberViews, M{
			"id": m.ShopMember.ID, "name": m.Name, "email_address": m.EmailAddress, "role": m.ShopMember.Role,
			"role_name": domain.StaffRoleNames[m.ShopMember.Role], "since": m.ShopMember.CreatedAt,
		})
	}
	invitationViews := make([]M, 0, len(invitations))
	for _, i := range invitations {
		invitationViews = append(invitationViews, M{
			"id": i.ID, "name": i.Name, "email_address": i.EmailAddress, "role": i.Role, "role_name": domain.StaffRoleNames[i.Role],
			"join_path": "/staff/join/" + i.Token, "expires_at": i.ExpiresAt,
		})
	}
	return c.JSON(http.StatusOK, M{
		"members": memberViews, "invitations": invitationViews, "max_staff": domain.MaxStaffFor(sub, time.Now()),
		"plan_allows": domain.PlanAllows(sub, domain.FeatureStaff, time.Now()),
	})
}

func (s *Server) inviteStaff(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in domain.StaffInvitationInput
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	if err := s.requireFeature(ctx, o.Shop.ID, domain.FeatureStaff); err != nil {
		return err
	}
	var invitation store.StaffInvitation
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := s.requireWritable(ctx, q, o.Shop.ID); err != nil {
			return err
		}
		// One invitation at a time per shop, so two taps cannot both take the last place.
		if _, err := q.LockShop(ctx, o.Shop.ID); err != nil {
			return err
		}
		sub, err := domain.SubscriptionFor(ctx, q, o.Shop.ID)
		if err != nil {
			return err
		}
		invitation, err = domain.InviteStaff(ctx, q, o.Shop, o.User.ID, in, domain.MaxStaffFor(sub, time.Now()), time.Now())
		return err
	})
	if err != nil {
		return err
	}
	return notice(c, "Invitation ready. Send "+invitation.Name+" the link.", M{"join_path": "/staff/join/" + invitation.Token})
}

func (s *Server) withdrawStaffInvitation(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	revoked, err := s.Q.RevokeStaffInvitation(c.Request().Context(), store.RevokeStaffInvitationParams{ID: paramID(c), ShopID: o.Shop.ID})
	if err != nil {
		return err
	}
	if revoked == 0 {
		return apperr.ErrNotFound
	}
	return notice(c, "Invitation withdrawn. The link no longer works.", nil)
}

func (s *Server) changeStaffRole(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	err = s.tx(ctx, func(q *store.Queries) error {
		member, err := q.MemberInShop(ctx, store.MemberInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
		if err != nil {
			return err
		}
		return domain.ChangeStaffRole(ctx, q, member, in.Role, o.User.ID)
	})
	if err != nil {
		return err
	}
	return notice(c, "Role changed.", nil)
}

func (s *Server) removeStaff(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	err = s.tx(ctx, func(q *store.Queries) error {
		member, err := q.MemberInShop(ctx, store.MemberInShopParams{ID: paramID(c), ShopID: o.Shop.ID})
		if err != nil {
			return err
		}
		return domain.RemoveStaff(ctx, q, member, o.User.ID)
	})
	if err != nil {
		return err
	}
	return notice(c, "Removed from your staff, and signed out. What they recorded stays, under their name.", nil)
}

// --------------------------------------------------------- joining a shop

func (s *Server) staffInvitation(c *echo.Context) error {
	row, err := domain.StaffInvitation(c.Request().Context(), s.Q, c.Param("token"), time.Now())
	if err != nil {
		return err
	}
	i := row.StaffInvitation
	return c.JSON(http.StatusOK, M{"shop_name": row.ShopName, "name": i.Name, "email_address": i.EmailAddress, "role": i.Role, "role_name": domain.StaffRoleNames[i.Role]})
}

func (s *Server) acceptStaffInvitation(c *echo.Context) error {
	if !s.limiter.allow("staff_join", clientIP(c), 10, time.Hour) {
		return apperr.NewRateLimited("Too many tries. Wait a while and try again.")
	}
	var in struct {
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	err := s.tx(ctx, func(q *store.Queries) error {
		user, err := domain.AcceptStaffInvitation(ctx, q, c.Param("token"), in.Name, in.Password, time.Now())
		if err != nil {
			return err
		}
		return s.startSession(c, q, user.ID)
	})
	if err != nil {
		return err
	}
	return notice(c, "Welcome. You are signed in.", nil)
}
