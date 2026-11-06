package api

import (
	"net"
	"strings"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
)

// One server, two hosts. bangkee.bt is the homepage and the app shops and
// customers use; admin.bangkee.bt is the operator's console. The host is the
// whole of the switch — any name starting "admin." is the console, which is
// also how admin.localhost works in development. Cookies carry no Domain, so
// each host has its own sign-in.

func hostname(c *echo.Context) string {
	host := c.Request().Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.ToLower(host)
}

func isAdminHost(c *echo.Context) bool { return strings.HasPrefix(hostname(c), "admin.") }

// adminHostFor names the console's address for the app host serving this
// request — port included, so in development it reads admin.localhost:5173,
// the address that actually opens.
func adminHostFor(c *echo.Context) string { return "admin." + strings.ToLower(c.Request().Host) }

// The API the console needs: who is signed in, the operator's own screens,
// the screenshots it reviews, and the bell.
var adminHostAPI = []string{
	"/api/me", "/api/session", "/api/passwords", "/api/admin/", "/api/attachments/",
	"/api/notifications", "/api/push_subscription", "/api/language", "/api/live",
}

// hostGate keeps each host to its own API: everything else is a 404, the
// same as a route that does not exist.
func hostGate(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		path := c.Request().URL.Path
		if isAdminHost(c) {
			for _, prefix := range adminHostAPI {
				if path == strings.TrimSuffix(prefix, "/") || strings.HasPrefix(path, prefix) {
					return next(c)
				}
			}
			return apperr.ErrNotFound
		}
		if strings.HasPrefix(path, "/api/admin/") {
			return apperr.ErrNotFound
		}
		return next(c)
	}
}
