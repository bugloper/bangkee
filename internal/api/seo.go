package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io/fs"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/labstack/echo/v5"

	"bangkee/internal/domain"
	"bangkee/internal/money"
	"bangkee/internal/store"
)

// What search engines and link previews read. The app is one page drawn in
// the browser, so the server writes each address's title, description,
// canonical address, preview tags and structured data into index.html before
// it goes out: the homepage, and each shop's public page, are findable on
// their own. The console and the signed-in screens are kept out of search.

const (
	siteName           = "Bangkee"
	homeTitle          = "Bangkee — the credit book your shop and your customers share"
	homeDescription    = "Bangkee replaces the credit notebook in shops across Bhutan. The shop records every credit and payment; customers see their balance on their own phone, the moment it happens. English and Dzongkha."
	descriptionMaxRune = 160
)

// The addresses worth finding in a search; everything else in the app is
// behind sign-in.
var publicShopPath = regexp.MustCompile(`^/shop/(\d+)$`)

type pageMeta struct {
	title       string
	description string
	path        string // canonical path, "" for none
	image       string // absolute or site-relative
	index       bool
	jsonLD      []any
}

func (s *Server) baseURL(c *echo.Context) string {
	return c.Scheme() + "://" + c.Request().Host
}

// meta decides what the page at this address says about itself.
func (s *Server) meta(c *echo.Context) pageMeta {
	if isAdminHost(c) {
		return pageMeta{title: "Bangkee console", index: false}
	}
	requestPath := c.Request().URL.Path
	base := s.baseURL(c)
	switch {
	case requestPath == "/":
		return pageMeta{
			title: homeTitle, description: homeDescription, path: "/", image: "/og.png", index: true,
			jsonLD: []any{
				M{"@context": "https://schema.org", "@type": "Organization", "name": siteName, "url": base + "/", "logo": base + "/icon.png"},
				M{
					"@context": "https://schema.org", "@type": "SoftwareApplication", "name": siteName, "url": base + "/",
					"applicationCategory": "BusinessApplication", "operatingSystem": "Web, Android, iOS", "description": homeDescription,
					"offers": M{"@type": "Offer", "price": strconv.FormatInt(s.Cfg.Operator.PriceCents/100, 10), "priceCurrency": "BTN"},
				},
			},
		}
	case requestPath == "/registration/new":
		return pageMeta{title: "Start your free trial — Bangkee", description: "Open your shop's credit book on Bangkee. The first " + strconv.Itoa(domain.TrialMonths) + " months are free.", path: requestPath, image: "/og.png", index: true}
	case requestPath == "/session/new":
		return pageMeta{title: "Sign in — Bangkee", description: homeDescription, path: requestPath, image: "/og.png", index: true}
	}
	if m := publicShopPath.FindStringSubmatch(requestPath); m != nil {
		id, _ := strconv.ParseInt(m[1], 10, 64)
		if meta, ok := s.shopMeta(c.Request().Context(), base, id); ok {
			return meta
		}
	}
	// The signed-in app, and anything unknown: no reason to be in a search.
	return pageMeta{title: siteName, description: homeDescription, image: "/og.png", index: false}
}

// shopMeta is a shop's public page as a search result. False when the shop
// has no public page (it has listed nothing).
func (s *Server) shopMeta(ctx context.Context, base string, id int64) (pageMeta, bool) {
	shop, err := s.Q.ShopByID(ctx, id)
	if err != nil {
		return pageMeta{}, false
	}
	counts, err := s.Q.ShopCounts(ctx, shop.ID)
	if err != nil || counts.MenuItems == 0 {
		return pageMeta{}, false
	}
	kind := domain.ShopKindLabel(shop.Kind)
	where := kind
	if shop.Location != nil && *shop.Location != "" {
		where = kind + " in " + *shop.Location
	}
	description := fmt.Sprintf("%s. Prices for %s, opening hours and directions — on Bangkee.", where, money.Pluralize(counts.MenuItems, "item"))
	if shop.About != nil && strings.TrimSpace(*shop.About) != "" {
		description = strings.TrimSpace(*shop.About) + " " + description
	}
	image := "/og.png"
	if photos, err := domain.ShopPhotoURLs(ctx, s.Q, []int64{shop.ID}); err == nil {
		if url, ok := photos[shop.ID]; ok {
			image = url
		}
	}
	path := fmt.Sprintf("/shop/%d", shop.ID)
	store := M{"@context": "https://schema.org", "@type": "Store", "name": shop.Name, "url": base + path, "description": truncate(description), "image": absolute(base, image)}
	if shop.Location != nil && *shop.Location != "" {
		store["address"] = M{"@type": "PostalAddress", "streetAddress": *shop.Location, "addressCountry": "BT"}
	}
	if shop.Latitude != nil && shop.Longitude != nil {
		store["geo"] = M{"@type": "GeoCoordinates", "latitude": *shop.Latitude, "longitude": *shop.Longitude}
	}
	if shop.Phone != nil && *shop.Phone != "" {
		store["telephone"] = *shop.Phone
	}
	return pageMeta{title: shop.Name + " — " + where + " | Bangkee", description: description, path: path, image: image, index: true, jsonLD: []any{store}}, true
}

func truncate(text string) string {
	text = strings.Join(strings.Fields(text), " ")
	if utf8.RuneCountInString(text) <= descriptionMaxRune {
		return text
	}
	runes := []rune(text)
	cut := strings.TrimRight(string(runes[:descriptionMaxRune-1]), " ,.;—-")
	return cut + "…"
}

func absolute(base, url string) string {
	if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
		return url
	}
	return base + url
}

var titleTag = regexp.MustCompile(`(?s)<title>.*?</title>`)

// renderPage is index.html with this address's title and tags in its head.
func (s *Server) renderPage(c *echo.Context, page []byte) []byte {
	meta := s.meta(c)
	base := s.baseURL(c)
	esc := html.EscapeString
	var head strings.Builder
	head.WriteString("<title>" + esc(meta.title) + "</title>\n")
	if meta.description != "" {
		description := truncate(meta.description)
		head.WriteString(`<meta name="description" content="` + esc(description) + "\" />\n")
		head.WriteString(`<meta property="og:description" content="` + esc(description) + "\" />\n")
		head.WriteString(`<meta name="twitter:description" content="` + esc(description) + "\" />\n")
	}
	if meta.index {
		head.WriteString(`<meta name="robots" content="index,follow" />` + "\n")
	} else {
		head.WriteString(`<meta name="robots" content="noindex,nofollow" />` + "\n")
	}
	if meta.path != "" {
		head.WriteString(`<link rel="canonical" href="` + esc(base+meta.path) + "\" />\n")
		head.WriteString(`<meta property="og:url" content="` + esc(base+meta.path) + "\" />\n")
	}
	head.WriteString(`<meta property="og:site_name" content="` + siteName + "\" />\n")
	head.WriteString(`<meta property="og:type" content="website" />` + "\n")
	head.WriteString(`<meta property="og:title" content="` + esc(meta.title) + "\" />\n")
	head.WriteString(`<meta name="twitter:title" content="` + esc(meta.title) + "\" />\n")
	if meta.image != "" {
		image := absolute(base, meta.image)
		head.WriteString(`<meta property="og:image" content="` + esc(image) + "\" />\n")
		head.WriteString(`<meta name="twitter:image" content="` + esc(image) + "\" />\n")
		head.WriteString(`<meta name="twitter:card" content="summary_large_image" />` + "\n")
	}
	for _, data := range meta.jsonLD {
		encoded, err := json.Marshal(data)
		if err != nil {
			continue
		}
		// "</" inside a script would end it early.
		head.WriteString(`<script type="application/ld+json">` + strings.ReplaceAll(string(encoded), "</", `<\/`) + "</script>\n")
	}
	out := titleTag.ReplaceAll(page, nil)
	return bytes.Replace(out, []byte("</head>"), []byte(head.String()+"</head>"), 1)
}

// writePage sends index.html, written for this address.
func (s *Server) writePage(c *echo.Context, files fs.FS) error {
	page, err := fs.ReadFile(files, "index.html")
	if err != nil {
		return err
	}
	header := c.Response().Header()
	header.Set("Cache-Control", "no-cache")
	if isAdminHost(c) {
		header.Set("X-Robots-Tag", "noindex, nofollow")
	}
	return c.HTMLBlob(http.StatusOK, s.renderPage(c, page))
}

// robots keeps the console and the API out of search, and points at the sitemap.
func (s *Server) robots(c *echo.Context) error {
	if isAdminHost(c) {
		return c.String(http.StatusOK, "User-agent: *\nDisallow: /\n")
	}
	return c.String(http.StatusOK, "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: "+s.baseURL(c)+"/sitemap.xml\n")
}

// sitemap lists what is worth finding: the homepage, starting a shop, and
// every shop's public page.
func (s *Server) sitemap(c *echo.Context) error {
	if isAdminHost(c) {
		return echo.ErrNotFound
	}
	shops, err := s.Q.ShopDirectory(c.Request().Context(), store.ShopDirectoryParams{})
	if err != nil {
		return err
	}
	base := s.baseURL(c)
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n" + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, path := range []string{"/", "/registration/new"} {
		b.WriteString("  <url><loc>" + html.EscapeString(base+path) + "</loc></url>\n")
	}
	for _, shop := range shops {
		b.WriteString(fmt.Sprintf("  <url><loc>%s/shop/%d</loc></url>\n", html.EscapeString(base), shop.ID))
	}
	b.WriteString("</urlset>\n")
	c.Response().Header().Set("Cache-Control", "public, max-age=3600")
	return c.Blob(http.StatusOK, "application/xml; charset=utf-8", []byte(b.String()))
}
