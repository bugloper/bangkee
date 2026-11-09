package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Who is asking. The session row's random token sits in an HttpOnly cookie
// and is looked up on every request, so signing out anywhere is deleting a
// row. The guards below stand in for the Rails before_actions:
// require_authentication, require_shop_owner, require_platform_admin.

const (
	sessionCookie = "bangkee_session"
	inviteCookie  = "bangkee_invite"
)

type current struct {
	User      store.User
	SessionID int64
}

func (s *Server) optionalUser(c *echo.Context) (*current, error) {
	cookie, err := c.Cookie(sessionCookie)
	if err != nil || cookie.Value == "" {
		return nil, nil
	}
	row, err := s.Q.SessionUser(c.Request().Context(), &cookie.Value)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &current{User: row.User, SessionID: row.SessionID}, nil
}

func (s *Server) currentUser(c *echo.Context) (*current, error) {
	user, err := s.optionalUser(c)
	if err == nil && user == nil {
		err = apperr.ErrUnauthenticated
	}
	return user, err
}

// owner is whoever is working on the shop's side: its owner, or one of its
// staff (Role says which, and what they may do).
type owner struct {
	User store.User
	Shop store.Shop
	Role string // "owner", or the staff member's role
}

// owner is the guard for every shop-side endpoint. An owner may do
// anything there; a staff member only what their role allows for this
// endpoint (staffPermissions), and only while the shop's plan includes staff.
func (s *Server) owner(c *echo.Context) (*owner, error) {
	cur, err := s.currentUser(c)
	if err != nil {
		return nil, err
	}
	ctx := c.Request().Context()
	switch cur.User.Role {
	case domain.RoleShopOwner:
		shop, err := domain.ShopForOwner(ctx, s.Q, cur.User.ID)
		if err != nil {
			return nil, err
		}
		if shop == nil {
			return nil, apperr.NewForbidden("That area is for shop owners.")
		}
		return &owner{User: cur.User, Shop: *shop, Role: domain.ShopOwnerRole}, nil
	case domain.RoleStaff:
		m, err := s.staffMembership(ctx, cur.User.ID)
		if err != nil {
			return nil, err
		}
		if !domain.Can(m.Member.Role, requiredPermission(c)) {
			return nil, apperr.NewForbidden("Your role in " + m.Shop.Name + " does not include that. Ask the owner.")
		}
		return &owner{User: cur.User, Shop: m.Shop, Role: m.Member.Role}, nil
	}
	return nil, apperr.NewForbidden("That area is for shop owners.")
}

// staffMembership is the shop a staff member works in, while they are on
// its staff and its plan includes staff.
func (s *Server) staffMembership(ctx context.Context, userID int64) (*domain.Membership, error) {
	m, err := domain.ActiveMembership(ctx, s.Q, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, apperr.NewForbidden("You are no longer on a shop's staff.")
	}
	allowed, err := s.planAllows(ctx, s.Q, m.Shop.ID, domain.FeatureStaff)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, apperr.NewForbidden(m.Shop.Name + "'s plan no longer includes staff accounts. Ask the owner.")
	}
	return m, nil
}

// shopSide says whether this person sees the shop's side of its book: the
// owner, or any of its current staff.
func (s *Server) shopSide(ctx context.Context, user store.User, shop store.Shop) (bool, error) {
	switch user.Role {
	case domain.RoleShopOwner:
		return shop.OwnerID == user.ID, nil
	case domain.RoleStaff:
		m, err := domain.ActiveMembership(ctx, s.Q, user.ID)
		if err != nil || m == nil || m.Shop.ID != shop.ID {
			return false, err
		}
		return s.planAllows(ctx, s.Q, shop.ID, domain.FeatureStaff)
	}
	return false, nil
}

// shopOf is the shop this person works in, owner or staff, and their role
// there; nil for a customer.
func (s *Server) shopOf(ctx context.Context, user store.User) (*store.Shop, string, error) {
	switch user.Role {
	case domain.RoleShopOwner:
		shop, err := domain.ShopForOwner(ctx, s.Q, user.ID)
		return shop, domain.ShopOwnerRole, err
	case domain.RoleStaff:
		m, err := s.staffMembership(ctx, user.ID)
		if err != nil {
			var appErr *apperr.Error
			if errors.As(err, &appErr) {
				return nil, "", nil // off the staff, or the plan no longer has staff: no shop
			}
			return nil, "", err
		}
		return &m.Shop, m.Member.Role, nil
	}
	return nil, "", nil
}

// requireWritable is BR-40: once the grace period is exhausted the owner
// keeps every read, but writes stop until a payment is approved. Billing is
// never blocked.
func (s *Server) requireWritable(ctx context.Context, q *store.Queries, shopID int64) error {
	sub, err := domain.SubscriptionFor(ctx, q, shopID)
	if err != nil || sub == nil || !domain.WriteLocked(*sub) {
		return err
	}
	if err := domain.RefreshStatus(ctx, s.Q, *sub); err != nil {
		return err
	}
	return apperr.ErrWriteLocked
}

func (s *Server) admin(c *echo.Context) (*current, error) {
	cur, err := s.currentUser(c)
	if err == nil && !cur.User.PlatformAdmin {
		err = apperr.NewForbidden("That area is for Bangkee staff.")
	}
	return cur, err
}

func secure(c *echo.Context) bool { return c.Request().Header.Get("X-Forwarded-Proto") == "https" }

// startSession is `start_new_session_for`: a row, and a permanent HttpOnly
// cookie naming it.
func (s *Server) startSession(c *echo.Context, q *store.Queries, userID int64) error {
	token := util.SecureToken()
	err := q.CreateSession(c.Request().Context(), store.CreateSessionParams{
		UserID: userID, Token: &token, IpAddress: util.Ptr(c.RealIP()), UserAgent: util.Presence(c.Request().UserAgent()),
	})
	if err != nil {
		return err
	}
	c.SetCookie(&http.Cookie{
		Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: secure(c), MaxAge: 20 * 365 * 24 * 60 * 60,
	})
	return nil
}

func clearCookie(c *echo.Context, name string) {
	c.SetCookie(&http.Cookie{Name: name, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
}

// ------------------------------------------------------- signed cookies

func (s *Server) sign(purpose, value string) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(purpose + "\x00" + value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) verify(purpose, value, signature string) bool {
	return hmac.Equal([]byte(s.sign(purpose, value)), []byte(signature))
}

func (s *Server) setSignedCookie(c *echo.Context, name, value string) {
	c.SetCookie(&http.Cookie{
		Name: name, Value: value + "--" + s.sign(name, value), Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, Secure: secure(c),
	})
}

func (s *Server) signedCookie(c *echo.Context, name string) string {
	cookie, err := c.Cookie(name)
	if err != nil {
		return ""
	}
	value, signature, ok := strings.Cut(cookie.Value, "--")
	if !ok || !s.verify(name, value, signature) {
		return ""
	}
	return value
}

// ---------------------------------------------------------- rate limits

// rateLimiter is Rails' `rate_limit`: so many requests per client address per
// window, kept in memory. One process serves Bangkee, so memory is the whole
// truth.
type rateLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

func newRateLimiter() *rateLimiter { return &rateLimiter{hits: map[string][]time.Time{}} }

func (r *rateLimiter) allow(bucket, ip string, limit int, window time.Duration) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := bucket + "|" + ip
	now := time.Now()
	kept := r.hits[key][:0]
	for _, at := range r.hits[key] {
		if now.Sub(at) < window {
			kept = append(kept, at)
		}
	}
	if len(kept) >= limit {
		r.hits[key] = kept
		return false
	}
	r.hits[key] = append(kept, now)
	return true
}

func clientIP(c *echo.Context) string {
	ip := c.RealIP()
	if host, _, err := net.SplitHostPort(ip); err == nil {
		return host
	}
	return ip
}
