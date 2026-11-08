package api_test

import (
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"testing"
)

// raw fetches a page as a browser or a search engine would: no JSON, just the body.
func (b *browser) raw(path string) (int, http.Header, string) {
	b.app.t.Helper()
	request, _ := http.NewRequest("GET", b.app.server.URL+path, nil)
	request.Host = b.host
	result, err := b.client.Do(request)
	if err != nil {
		b.app.t.Fatal(err)
	}
	defer result.Body.Close()
	body, _ := io.ReadAll(result.Body)
	return result.StatusCode, result.Header, string(body)
}

func TestSearchEnginesFindTheHomepageAndShopsButNotTheApp(t *testing.T) {
	if _, err := os.Stat("../../web/dist/index.html"); err != nil {
		t.Skip("the web app is not built (web/dist)")
	}
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	owner.patch("/api/shop/profile", map[string]any{"name": "Karma's </script> Shop", "kind": "grocery", "location": "Paro Town", "phone": "17 55 66 77", "latitude": 27.43, "longitude": 89.41})
	owner.post("/api/menu_items", map[string]any{"name": "Rice", "price": "620", "available": true})
	a.browser().openShop("Empty", "empty@shop.bt") // nothing listed: no public page
	visitor := a.browser()

	status, _, home := visitor.raw("/")
	equal(t, status, 200, "homepage")
	equal(t, strings.Count(home, "<title>"), 1, "one title")
	equal(t, strings.Contains(home, "<title>Bangkee — the credit book your shop and your customers share</title>"), true, "the homepage's title")
	equal(t, strings.Contains(home, `<meta name="description" content="Bangkee replaces the credit notebook`), true, "a description")
	equal(t, strings.Contains(home, `<link rel="canonical" href="http://bangkee.test/"`), true, "its canonical address")
	equal(t, strings.Contains(home, `<meta property="og:image" content="http://bangkee.test/og.png"`), true, "a preview image")
	equal(t, strings.Contains(home, `"@type":"SoftwareApplication"`), true, "what Bangkee is")
	equal(t, strings.Contains(home, `"priceCurrency":"BTN"`), true, "and what it costs")
	equal(t, strings.Contains(home, `content="index,follow"`), true, "indexed")

	shopID := visitor.get("/api/public/shops").num("shops.0.id")
	_, _, shop := visitor.raw("/shop/" + itoa(shopID))
	equal(t, strings.Contains(shop, "<title>Karma&#39;s &lt;/script&gt; Shop — Grocery in Paro Town | Bangkee</title>"), true, "the shop's own title, escaped")
	equal(t, strings.Contains(shop, `"@type":"Store"`), true, "marked up as a shop")
	equal(t, strings.Contains(shop, `"latitude":27.43`), true, "with where it is")
	equal(t, strings.Contains(shop, `Karma's \u003c/script\u003e Shop`), true, "a name cannot end the structured data early")
	_, _, empty := visitor.raw("/shop/" + itoa(shopID+1))
	equal(t, strings.Contains(empty, `content="noindex,nofollow"`), true, "a shop with nothing listed is not indexed")

	_, _, app := visitor.raw("/dashboard")
	equal(t, strings.Contains(app, `content="noindex,nofollow"`), true, "the signed-in app is not indexed")

	_, headers, console := a.console().raw("/")
	equal(t, headers.Get("X-Robots-Tag"), "noindex, nofollow", "the console says so in a header")
	equal(t, strings.Contains(console, `content="noindex,nofollow"`), true, "and in the page")

	_, _, robots := visitor.raw("/robots.txt")
	equal(t, strings.Contains(robots, "Disallow: /api/"), true, "the API is out of search")
	equal(t, strings.Contains(robots, "Sitemap: http://bangkee.test/sitemap.xml"), true, "robots points at the sitemap")
	_, _, consoleRobots := a.console().raw("/robots.txt")
	equal(t, consoleRobots, "User-agent: *\nDisallow: /\n", "the console is out of search entirely")

	_, headers, sitemap := visitor.raw("/sitemap.xml")
	equal(t, strings.HasPrefix(headers.Get("Content-Type"), "application/xml"), true, "a sitemap")
	equal(t, strings.Contains(sitemap, "<loc>http://bangkee.test/shop/"+itoa(shopID)+"</loc>"), true, "lists the shop")
	equal(t, strings.Count(sitemap, "/shop/"), 1, "and only shops with something listed")
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
