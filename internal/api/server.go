// Package api is the HTTP side: the JSON API under /api and the built web
// app. The route table here and the client's copy in
// web/src/api/client.ts are kept in step by hand, one endpoint per line.
package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"

	"bangkee/internal/apperr"
	"bangkee/internal/config"
	"bangkee/internal/notify"
	"bangkee/internal/storage"
	"bangkee/internal/store"
)

type M = map[string]any

type Server struct {
	DB     *pgxpool.Pool
	Q      *store.Queries
	Cfg    config.Config
	Files  *storage.Storage
	Notify *notify.Notifier
	// Signs the short-lived cookies and password reset links.
	secret  []byte
	limiter *rateLimiter
	jobs    sync.WaitGroup
}

func NewServer(db *pgxpool.Pool, cfg config.Config, files *storage.Storage) *Server {
	secret := []byte(cfg.SecretKeyBase)
	if len(secret) == 0 {
		slog.Warn("SECRET_KEY_BASE is not set — using a random signing key until the next restart")
		secret = make([]byte, 64)
		_, _ = rand.Read(secret)
	}
	return &Server{
		DB: db, Q: store.New(db), Cfg: cfg, Files: files, Notify: notify.New(db, cfg),
		secret: secret, limiter: newRateLimiter(),
	}
}

// Wait lets background work (notifications) finish.
func (s *Server) Wait() {
	s.jobs.Wait()
	s.Notify.Wait()
}

// tx runs fn in one database transaction.
func (s *Server) tx(ctx context.Context, fn func(q *store.Queries) error) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error { return fn(s.Q.WithTx(tx)) })
}

// decode reads a JSON body; a body that does not parse is the client's mistake.
func decode(c *echo.Context, into any) error {
	if err := json.NewDecoder(c.Request().Body).Decode(into); err != nil {
		return apperr.NewRule("That request could not be read.")
	}
	return nil
}

func notice(c *echo.Context, message string, extra M) error {
	body := M{"notice": message}
	for k, v := range extra {
		body[k] = v
	}
	return c.JSON(http.StatusOK, body)
}

// Photos are capped at 8 MB; leave room for the rest of the form.
const bodyLimit = 10 << 20

func (s *Server) Handler() http.Handler {
	e := echo.New()
	e.IPExtractor = echo.ExtractIPFromXFFHeader()
	e.HTTPErrorHandler = renderError
	e.Use(middleware.Recover(), middleware.RequestLogger(), middleware.BodyLimit(bodyLimit))

	api := e.Group("/api", requireAppHeader, hostGate)
	s.routes(api)
	api.RouteNotFound("/*", func(c *echo.Context) error { return apperr.ErrNotFound })

	e.GET("/up", func(c *echo.Context) error { return c.String(http.StatusOK, "OK") })
	e.GET("/*", serveApp(webDist()))
	return e
}

func (s *Server) routes(g *echo.Group) {
	// identity
	g.GET("/me", s.me)
	g.POST("/session", s.signIn)
	g.DELETE("/session", s.signOut)
	g.GET("/registration", s.registration)
	g.POST("/registration", s.register)
	g.POST("/passwords", s.requestReset)
	g.GET("/passwords/:token", s.checkReset)
	g.PUT("/passwords/:token", s.updatePassword)
	// the shops catalog
	g.GET("/shops", s.shopDirectory)
	g.GET("/shops/:id", s.shopPage)
	g.PATCH("/shop/kind", s.setShopKind)

	g.GET("/invitations/:token", s.invitation)
	g.POST("/invitations/:token/join", s.joinWithPIN)
	g.POST("/invitations/:token/pin", s.newPIN)
	// home
	g.GET("/dashboard", s.dashboard)
	g.GET("/insights", s.insights)
	// accounts & ledger
	g.GET("/accounts", s.accounts)
	g.POST("/accounts", s.createAccount)
	g.GET("/accounts/:id", s.account)
	g.PATCH("/accounts/:id", s.updateAccount)
	g.DELETE("/accounts/:id", s.destroyAccount)
	g.POST("/accounts/:id/credits", s.createCredit)
	g.POST("/accounts/:id/payments", s.createPayment)
	g.GET("/accounts/:id/statement", s.statement)
	g.GET("/accounts/:id/invite", s.invite)
	g.POST("/accounts/:id/pin_reset", s.pinReset)
	g.GET("/transactions/:id", s.transaction)
	g.PATCH("/transactions/:id", s.updateTransaction)
	g.POST("/transactions/:id/cross_out", s.crossOutTransaction)
	// bank details
	g.GET("/bank_accounts", s.bankAccounts)
	g.POST("/bank_accounts", s.createBankAccount)
	g.GET("/bank_accounts/:id", s.bankAccount)
	g.PATCH("/bank_accounts/:id", s.updateBankAccount)
	g.DELETE("/bank_accounts/:id", s.destroyBankAccount)
	// items
	g.GET("/menu_items", s.menuItems)
	g.POST("/menu_items", s.createMenuItem)
	g.GET("/menu_items/:id", s.menuItem)
	g.PATCH("/menu_items/:id", s.updateMenuItem)
	g.POST("/menu_items/:id/image", s.setItemImage)
	g.DELETE("/menu_items/:id/image", s.removeItemImage)
	g.DELETE("/menu_items/:id", s.destroyMenuItem)
	g.GET("/public/pricing", s.pricing)
	g.GET("/public/item_images/:id", s.itemImage)
	// settings & billing
	g.GET("/settings", s.settings)
	g.PATCH("/language", s.setLanguage)
	g.GET("/feedback", s.myFeedback)
	g.POST("/feedback", s.sendFeedback)
	g.GET("/subscription", s.billing)
	g.POST("/subscription/payments", s.submitSubscriptionPayment)
	// operator
	g.GET("/admin/dashboard", s.adminDashboard)
	g.GET("/admin/subscription_payments", s.adminPayments)
	g.POST("/admin/subscription_payments/:id/approve", s.approvePayment)
	g.POST("/admin/subscription_payments/:id/reject", s.rejectPayment)
	g.GET("/admin/shops", s.adminShops)
	g.GET("/admin/feedback", s.adminFeedback)
	g.POST("/admin/feedback/:id/acknowledge", s.acknowledgeFeedback)
	g.POST("/admin/feedback/:id/reply", s.replyToFeedback)
	// notifications & push
	g.GET("/notifications", s.notifications)
	g.POST("/notifications/read_all", s.readAllNotifications)
	g.POST("/notifications/:id/read", s.readNotification)
	g.POST("/push_subscription", s.subscribePush)
	g.DELETE("/push_subscription", s.unsubscribePush)
	// files
	g.GET("/attachments/:id", s.attachment)
}

// requireAppHeader stands in for Rails' CSRF token. The session cookie is
// SameSite=Lax, and every state-changing API call must also carry a header
// that a cross-site form cannot set.
func requireAppHeader(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		switch c.Request().Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			if c.Request().Header.Get("X-Requested-With") != "bangkee" {
				return apperr.NewForbidden("That request did not come from Bangkee.")
			}
		}
		return next(c)
	}
}

func renderError(c *echo.Context, err error) {
	if resp, unwrapErr := echo.UnwrapResponse(c.Response()); unwrapErr == nil && resp.Committed {
		return
	}
	var httpErr *echo.HTTPError
	if errors.As(err, &httpErr) {
		// Echo's own refusals: an unknown route, a body over the limit.
		_ = c.JSON(httpErr.Code, M{"error": http.StatusText(httpErr.Code)})
		return
	}
	status, body, internal := apperr.Render(err)
	if internal {
		slog.Error("internal error", "path", c.Request().URL.Path, "error", err)
	}
	_ = c.JSON(status, body)
}

// webDist is the built web app, whether the server runs from the repository
// root or from somewhere below it.
func webDist() string {
	for _, dir := range []string{"web/dist", "../web/dist", "../../web/dist"} {
		if _, err := os.Stat(path.Join(dir, "index.html")); err == nil {
			return dir
		}
	}
	return "web/dist"
}

// serveApp serves the single-page app: a file when one exists, index.html
// for every other path so the client router can take it. Vite fingerprints
// everything under /assets, so those are kept forever; the page and the
// service worker are revalidated every time, or a deploy would sit unseen
// behind the old ones.
func serveApp(dist string) echo.HandlerFunc {
	files := os.DirFS(dist)
	return func(c *echo.Context) error {
		name := strings.TrimPrefix(path.Clean("/"+c.Request().URL.Path), "/")
		if info, err := fs.Stat(files, name); name == "" || err != nil || info.IsDir() {
			name = "index.html"
		}
		header := c.Response().Header()
		if strings.HasPrefix(name, "assets/") {
			header.Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			header.Set("Cache-Control", "no-cache")
		}
		http.ServeFileFS(c.Response(), c.Request(), files, name)
		return nil
	}
}
