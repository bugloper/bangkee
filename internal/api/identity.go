package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// -------------------------------------------------------------------- me

// me is the shell's one query: who, which shop, the badges on the nav.
func (s *Server) me(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	ctx, q, user := c.Request().Context(), s.Q, cur.User

	var shopView *domain.ShopRef
	var subView *domain.SubscriptionDTO
	var adminPayments, adminFeedback, adminTestimonials int64
	if user.Role == domain.RoleShopOwner {
		shop, err := domain.ShopForOwner(ctx, q, user.ID)
		if err != nil {
			return err
		}
		if shop != nil {
			view := domain.ShopView(*shop)
			shopView = &view
			sub, err := domain.SubscriptionFor(ctx, q, shop.ID)
			if err != nil {
				return err
			}
			if sub != nil {
				dto := domain.SubscriptionView(*sub)
				subView = &dto
			}
		}
	}
	if user.PlatformAdmin {
		if adminPayments, err = q.PendingSubscriptionPaymentCount(ctx); err != nil {
			return err
		}
		if adminFeedback, err = q.NewFeedbackCount(ctx); err != nil {
			return err
		}
		if adminTestimonials, err = q.PendingTestimonialCount(ctx); err != nil {
			return err
		}
	}
	unread, err := q.UnreadCount(ctx, user.ID)
	if err != nil {
		return err
	}
	devices, err := q.PushDeviceCount(ctx, user.ID)
	if err != nil {
		return err
	}
	var publicKey *string
	if s.Cfg.Vapid != nil {
		publicKey = &s.Cfg.Vapid.PublicKey
	}
	photos, err := domain.AvatarURLs(ctx, q, []int64{user.ID})
	if err != nil {
		return err
	}
	userView := domain.UserView(user)
	userView.PhotoURL = domain.PhotoURL(photos, &user.ID)
	return c.JSON(http.StatusOK, M{
		"user":                 userView,
		"shop":                 shopView,
		"subscription":         subView,
		"badges":               M{"admin_payments": adminPayments, "admin_feedback": adminFeedback, "admin_testimonials": adminTestimonials},
		"unread_notifications": unread,
		"push":                 M{"configured": s.Cfg.Vapid != nil, "public_key": publicKey, "devices": devices},
	})
}

// -------------------------------------------------------------- sessions

func (s *Server) signIn(c *echo.Context) error {
	if !s.limiter.allow("session", clientIP(c), 10, 3*time.Minute) {
		return apperr.NewRateLimited("Try again later.")
	}
	var in struct {
		EmailAddress string `json:"email_address"`
		Password     string `json:"password"`
		// Or, for a customer: their phone and 4-digit PIN.
		Phone string `json:"phone"`
		PIN   string `json:"pin"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	var user *store.User
	var err error
	if strings.TrimSpace(in.Phone) != "" {
		// A PIN has 10,000 values: a few tries per phone, wherever they come from.
		if !s.limiter.allow("pin", domain.NormalizePhone(in.Phone), 5, 15*time.Minute) {
			return apperr.NewRateLimited("Too many tries for that phone. Wait 15 minutes, or ask the shop for a new link.")
		}
		if user, err = domain.AuthenticateByPhone(ctx, s.Q, in.Phone, in.PIN); err != nil {
			return err
		}
		if user == nil {
			return apperr.NewRule("Try another phone number or PIN.")
		}
	} else {
		if user, err = domain.Authenticate(ctx, s.Q, in.EmailAddress, in.Password); err != nil {
			return err
		}
		if user == nil {
			return apperr.NewRule("Try another email address or password.")
		}
	}
	// Each host signs in the people it is for: the console only staff, the
	// app everyone else (and staff who also run a shop).
	if isAdminHost(c) && !user.PlatformAdmin {
		return apperr.NewRule("That area is for Bangkee staff.")
	}
	if !isAdminHost(c) && user.PlatformAdmin {
		shop, err := domain.ShopForOwner(ctx, s.Q, user.ID)
		if err != nil {
			return err
		}
		if shop == nil && user.Role == domain.RoleShopOwner {
			return apperr.NewRule("Bangkee staff sign in at " + adminHostFor(c) + ".")
		}
	}
	if err := s.startSession(c, s.Q, user.ID); err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{})
}

func (s *Server) signOut(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	if err := s.Q.DeleteSession(c.Request().Context(), cur.SessionID); err != nil {
		return err
	}
	clearCookie(c, sessionCookie)
	return c.JSON(http.StatusOK, M{})
}

// ---------------------------------------------------------- registration

func (s *Server) registration(c *echo.Context) error {
	return c.JSON(http.StatusOK, M{"invited": s.signedCookie(c, inviteCookie) != ""})
}

// register: a visitor arriving from an invite link is signing up as a
// customer; anyone else who reaches this is opening a shop.
func (s *Server) register(c *echo.Context) error {
	if cur, err := s.optionalUser(c); err != nil || cur != nil {
		if err != nil {
			return err
		}
		return apperr.NewRule("You are already signed in.")
	}
	var in struct {
		Name         string `json:"name"`
		ShopName     string `json:"shop_name"`
		EmailAddress string `json:"email_address"`
		Phone        string `json:"phone"`
		Password     string `json:"password"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	invite := s.signedCookie(c, inviteCookie)
	role := domain.RoleShopOwner
	if invite != "" {
		role = domain.RoleCustomer
	}
	shopName := strings.TrimSpace(in.ShopName)
	if role == domain.RoleShopOwner && shopName == "" {
		return apperr.NewValidation("Your shop needs a name")
	}

	ctx := c.Request().Context()
	var joined int64
	err := s.tx(ctx, func(q *store.Queries) error {
		user, err := domain.CreateUser(ctx, q, domain.NewUser{
			Name: in.Name, EmailAddress: in.EmailAddress, Phone: in.Phone, Password: in.Password, Role: role,
		})
		if err != nil {
			return err
		}
		if role == domain.RoleShopOwner {
			if _, err := domain.CreateShop(ctx, q, user.ID, shopName, s.Cfg.Operator.PriceCents); err != nil {
				return err
			}
		}
		// BR-26: the invite that brought them here links them straight away.
		if invite != "" {
			account, err := domain.AccountByInviteToken(ctx, q, invite)
			if err != nil {
				return err
			}
			if account != nil {
				claimed, err := domain.ClaimAccount(ctx, q, *account, user)
				if err != nil {
					return err
				}
				if claimed {
					joined = account.ID
				}
			}
		}
		return s.startSession(c, q, user.ID)
	})
	if err != nil {
		return err
	}
	if joined != 0 {
		s.Notify.AccountJoined(ctx, joined)
	}
	clearCookie(c, inviteCookie)
	return notice(c, "Welcome to Bangkee.", nil)
}

// -------------------------------------------------------- password reset
//
// Rails 8's password reset token: signed, good for 15 minutes, and dead the
// moment the password changes (the signature covers the digest).

const resetLifetime = 15 * time.Minute

func (s *Server) resetSignature(userID, expires int64, digest string) string {
	mac := hmac.New(sha256.New, s.secret)
	fmt.Fprintf(mac, "password_reset:%d:%d:%s", userID, expires, digest)
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) resetToken(user store.User) string {
	expires := time.Now().Add(resetLifetime).Unix()
	return fmt.Sprintf("%d.%d.%s", user.ID, expires, s.resetSignature(user.ID, expires, user.PasswordDigest))
}

func (s *Server) userByResetToken(c *echo.Context) (store.User, error) {
	invalid := apperr.NewRule("Password reset link is invalid or has expired.")
	parts := strings.SplitN(c.Param("token"), ".", 3)
	if len(parts) != 3 {
		return store.User{}, invalid
	}
	userID, err1 := strconv.ParseInt(parts[0], 10, 64)
	expires, err2 := strconv.ParseInt(parts[1], 10, 64)
	if err1 != nil || err2 != nil || expires < time.Now().Unix() {
		return store.User{}, invalid
	}
	user, err := s.Q.UserByID(c.Request().Context(), userID)
	if err != nil || !hmac.Equal([]byte(s.resetSignature(user.ID, expires, user.PasswordDigest)), []byte(parts[2])) {
		return store.User{}, invalid
	}
	return user, nil
}

func (s *Server) requestReset(c *echo.Context) error {
	if !s.limiter.allow("password", clientIP(c), 10, 3*time.Minute) {
		return apperr.NewRateLimited("Try again later.")
	}
	var in struct {
		EmailAddress string `json:"email_address"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	user, err := domain.UserByEmail(c.Request().Context(), s.Q, in.EmailAddress)
	if err != nil {
		return err
	}
	if user != nil {
		s.Notify.PasswordReset(*user.EmailAddress, s.resetToken(*user))
	}
	return notice(c, "Password reset instructions sent (if user with that email address exists).", nil)
}

func (s *Server) checkReset(c *echo.Context) error {
	if _, err := s.userByResetToken(c); err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{})
}

func (s *Server) updatePassword(c *echo.Context) error {
	user, err := s.userByResetToken(c)
	if err != nil {
		return err
	}
	var in struct {
		Password             string `json:"password"`
		PasswordConfirmation string `json:"password_confirmation"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	if in.Password == "" || len(in.Password) > 72 || in.Password != in.PasswordConfirmation {
		return apperr.NewRule("Passwords did not match.")
	}
	digest, err := domain.HashPassword(in.Password)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := q.SetPasswordDigest(ctx, store.SetPasswordDigestParams{ID: user.ID, PasswordDigest: digest}); err != nil {
			return err
		}
		return q.DeleteUserSessions(ctx, user.ID)
	})
	if err != nil {
		return err
	}
	return notice(c, "Password has been reset.", nil)
}

// ----------------------------------------------------------- invitations

// invitation is /join/:token — the link a shop owner shares with a customer.
func (s *Server) invitation(c *echo.Context) error {
	ctx := c.Request().Context()
	account, err := domain.AccountByInviteToken(ctx, s.Q, c.Param("token"))
	if err != nil {
		return err
	}
	if account == nil {
		return c.JSON(http.StatusOK, M{"outcome": "refused", "alert": "That invite link is not valid."})
	}
	shop, err := s.Q.ShopByID(ctx, account.ShopID)
	if err != nil {
		return err
	}
	cur, err := s.optionalUser(c)
	if err != nil {
		return err
	}
	if cur == nil {
		// Remembered for the sign-up that follows.
		s.setSignedCookie(c, inviteCookie, account.InviteToken)
		prefix := account.InviteToken
		if len(prefix) > 6 {
			prefix = prefix[:6]
		}
		next, err := s.inviteNext(ctx, *account)
		if err != nil {
			return err
		}
		return c.JSON(http.StatusOK, M{
			"outcome": "landing", "shop_name": shop.Name, "token_prefix": prefix,
			"customer_name": account.CustomerName, "phone": util.Deref(account.CustomerPhone), "next": next,
		})
	}

	// BR-25
	user := cur.User
	switch {
	case user.Role == domain.RoleShopOwner:
		return c.JSON(http.StatusOK, M{"outcome": "refused", "alert": "Invite links are for customers. Ask your customer to open it on their phone."})
	case account.CustomerID != nil && *account.CustomerID == user.ID:
		return c.JSON(http.StatusOK, M{"outcome": "already_yours", "account_id": account.ID, "notice": "You are already linked to " + shop.Name + "."})
	case account.CustomerID != nil:
		return c.JSON(http.StatusOK, M{"outcome": "refused", "alert": "That account has already been claimed by someone else."})
	}
	claimed, err := domain.ClaimAccount(ctx, s.Q, *account, user)
	if err != nil {
		return err
	}
	if !claimed {
		return c.JSON(http.StatusOK, M{"outcome": "refused", "alert": "That invite link could not be used."})
	}
	s.Notify.AccountJoined(ctx, account.ID)
	return c.JSON(http.StatusOK, M{"outcome": "claimed", "account_id": account.ID, "notice": "You are now linked to " + shop.Name + "."})
}

// inviteNext is what someone signed out does with an invite link:
//
//	join    — nobody signs in with this phone yet: name and a PIN, and they are in
//	sign_in — they already have a Bangkee login: sign in, and the link joins them
//	new_pin — the shop sent a fresh link for a forgotten PIN: choose a new one
func (s *Server) inviteNext(ctx context.Context, account store.Account) (string, error) {
	if account.CustomerID != nil {
		if account.PinResetUntil != nil && account.PinResetUntil.After(time.Now()) {
			return "new_pin", nil
		}
		return "sign_in", nil
	}
	existing, err := domain.CustomerByPhone(ctx, s.Q, util.Deref(account.CustomerPhone))
	if err != nil {
		return "", err
	}
	if existing != nil {
		return "sign_in", nil
	}
	return "join", nil
}

// openInvite is the invite link's account for someone signed out, nil (with
// the answer already written) when the link does not lead anywhere.
func (s *Server) openInvite(c *echo.Context) (*store.Account, error) {
	if !s.limiter.allow("join", clientIP(c), 10, 3*time.Minute) {
		return nil, apperr.NewRateLimited("Try again later.")
	}
	if cur, err := s.optionalUser(c); err != nil || cur != nil {
		if err != nil {
			return nil, err
		}
		return nil, apperr.NewRule("You are already signed in.")
	}
	account, err := domain.AccountByInviteToken(c.Request().Context(), s.Q, c.Param("token"))
	if err != nil {
		return nil, err
	}
	if account == nil {
		return nil, apperr.NewRule("That invite link is not valid.")
	}
	return account, nil
}

// joinWithPIN: a customer new to Bangkee joins with their name and a PIN.
// The phone is the one the shop sent the link to.
func (s *Server) joinWithPIN(c *echo.Context) error {
	account, err := s.openInvite(c)
	if err != nil {
		return err
	}
	var in struct {
		Name string `json:"name"`
		PIN  string `json:"pin"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	if next, err := s.inviteNext(ctx, *account); err != nil {
		return err
	} else if next != "join" {
		return apperr.NewRule("You already have a Bangkee login. Sign in with your phone and PIN.")
	}
	err = s.tx(ctx, func(q *store.Queries) error {
		user, err := domain.CreatePinCustomer(ctx, q, in.Name, util.Deref(account.CustomerPhone), in.PIN)
		if err != nil {
			return err
		}
		if _, err := domain.ClaimAccount(ctx, q, *account, user); err != nil {
			return err
		}
		return s.startSession(c, q, user.ID)
	})
	if err != nil {
		return err
	}
	s.Notify.AccountJoined(ctx, account.ID)
	clearCookie(c, inviteCookie)
	return notice(c, "Welcome to Bangkee.", M{"account_id": account.ID})
}

// newPIN: a forgotten PIN, through the fresh link the shop sent. Every other
// sign-in of theirs ends.
func (s *Server) newPIN(c *echo.Context) error {
	account, err := s.openInvite(c)
	if err != nil {
		return err
	}
	var in struct {
		PIN string `json:"pin"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	if next, err := s.inviteNext(ctx, *account); err != nil {
		return err
	} else if next != "new_pin" {
		return apperr.NewRule("This link cannot set a PIN. Ask the shop for a new one.")
	}
	if !domain.ValidPIN(in.PIN) {
		return apperr.NewValidation("PIN must be 4 digits")
	}
	digest, err := domain.HashPassword(in.PIN)
	if err != nil {
		return err
	}
	err = s.tx(ctx, func(q *store.Queries) error {
		if err := q.SetPasswordDigest(ctx, store.SetPasswordDigestParams{ID: *account.CustomerID, PasswordDigest: digest}); err != nil {
			return err
		}
		if err := q.DeleteUserSessions(ctx, *account.CustomerID); err != nil {
			return err
		}
		if err := q.EndPinReset(ctx, account.ID); err != nil {
			return err
		}
		if err := domain.Audit(ctx, q, "Account", account.ID, "pin_reset", account.CustomerID, nil); err != nil {
			return err
		}
		return s.startSession(c, q, *account.CustomerID)
	})
	if err != nil {
		return err
	}
	clearCookie(c, inviteCookie)
	return notice(c, "Your new PIN is set.", M{"account_id": account.ID})
}
