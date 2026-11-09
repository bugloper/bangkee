package api_test

// A signed-in browser, minus the browser: a real HTTP server over the real
// router, a cookie jar per person, and a database of its own for every test,
// created on the server DATABASE_URL names (from the environment or ./.env)
// and dropped afterwards.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"bangkee/internal/api"
	"bangkee/internal/config"
	"bangkee/internal/database"
	"bangkee/internal/storage"
	"bangkee/internal/util"
)

type app struct {
	phones int    // made-up phones handed out so far
	files  string // where this app's uploads land on disk
	t      *testing.T
	server *httptest.Server
	api    *api.Server
	DB     *pgxpool.Pool
}

func freshDatabase(t *testing.T) string {
	t.Helper()
	_ = godotenv.Load("../../.env")
	base := os.Getenv("DATABASE_URL")
	if base == "" {
		t.Skip("DATABASE_URL is not set")
	}
	parsed, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	name := "bangkee_test_" + strings.ToLower(util.SecureToken()[:10])
	admin := *parsed
	admin.Path = "/postgres"
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, admin.String())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	conn.Close(ctx)
	t.Cleanup(func() {
		conn, err := pgx.Connect(context.Background(), admin.String())
		if err == nil {
			_, _ = conn.Exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
			conn.Close(context.Background())
		}
	})
	parsed.Path = "/" + name
	return parsed.String()
}

func newApp(t *testing.T) *app {
	t.Helper()
	ctx := context.Background()
	db, err := database.Open(ctx, freshDatabase(t))
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	files, err := storage.New(config.Storage{}, root)
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		SecretKeyBase: "test-secret", Host: "bangkee.test", MailFrom: "Bangkee <notifications@bangkee.bt>",
		Operator: config.OperatorBilling{BankName: "Bank of Bhutan", AccountName: "Bangkee", AccountNumber: "1010 2030 4050",
			Branch: "Thimphu Main", PriceCents: 30_000},
	}
	server := api.NewServer(db, cfg, files)
	httpServer := httptest.NewServer(server.Handler())
	t.Cleanup(func() {
		httpServer.Close()
		server.Wait()
		db.Close()
	})
	return &app{t: t, server: httpServer, api: server, DB: db, files: root}
}

type browser struct {
	app    *app
	client *http.Client
	// host is the Host header sent.
	host string
}

// browser is someone at the app's address.
func (a *app) browser() *browser { return a.on("bangkee.test") }

func (a *app) on(host string) *browser {
	jar, _ := cookiejar.New(nil)
	return &browser{app: a, host: host, client: &http.Client{
		Jar: jar,
		// Redirects are what is being tested; never follow them.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

type response struct {
	Status   int
	Location string
	Body     map[string]any
}

// get reads a value out of the body by a dotted path: "ledger.0.kind".
func (r response) get(path string) any {
	var current any = r.Body
	for _, part := range strings.Split(path, ".") {
		switch node := current.(type) {
		case map[string]any:
			current = node[part]
		case []any:
			var index int
			fmt.Sscan(part, &index)
			if index >= len(node) {
				return nil
			}
			current = node[index]
		default:
			return nil
		}
	}
	return current
}

func (r response) str(path string) string {
	value, _ := r.get(path).(string)
	return value
}

func (r response) num(path string) int64 {
	value, _ := r.get(path).(float64)
	return int64(value)
}

func (r response) len(path string) int {
	value, _ := r.get(path).([]any)
	return len(value)
}

func (b *browser) do(request *http.Request) response {
	b.app.t.Helper()
	request.Host = b.host
	result, err := b.client.Do(request)
	if err != nil {
		b.app.t.Fatal(err)
	}
	defer result.Body.Close()
	raw, _ := io.ReadAll(result.Body)
	body := map[string]any{}
	_ = json.Unmarshal(raw, &body)
	return response{Status: result.StatusCode, Location: result.Header.Get("Location"), Body: body}
}

func (b *browser) request(method, path string, body any) response {
	var reader io.Reader
	if body != nil {
		encoded, _ := json.Marshal(body)
		reader = bytes.NewReader(encoded)
	}
	request, _ := http.NewRequest(method, b.app.server.URL+path, reader)
	request.Header.Set("X-Requested-With", "bangkee")
	request.Header.Set("Content-Type", "application/json")
	return b.do(request)
}

func (b *browser) get(path string) response             { return b.request("GET", path, nil) }
func (b *browser) post(path string, body any) response  { return b.request("POST", path, body) }
func (b *browser) patch(path string, body any) response { return b.request("PATCH", path, body) }
func (b *browser) delete(path string) response          { return b.request("DELETE", path, nil) }

// multipart posts a form as the photo, payment and billing forms send it.
func (b *browser) multipart(path string, fields map[string]string, fileField string, file []byte) response {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range fields {
		_ = writer.WriteField(name, value)
	}
	if fileField != "" {
		header := make(map[string][]string)
		header["Content-Disposition"] = []string{fmt.Sprintf(`form-data; name="%s"; filename="shot.png"`, fileField)}
		header["Content-Type"] = []string{"image/png"}
		part, _ := writer.CreatePart(header)
		_, _ = part.Write(file)
	}
	writer.Close()
	request, _ := http.NewRequest("POST", b.app.server.URL+path, &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("X-Requested-With", "bangkee")
	return b.do(request)
}

// ---------------------------------------------------------------- people

func (b *browser) openShop(name, email string) {
	b.app.t.Helper()
	r := b.post("/api/registration", map[string]any{"name": name, "shop_name": name + "'s Shop", "email_address": email, "password": "password"})
	if r.Status != 200 {
		b.app.t.Fatalf("open shop: %d %v", r.Status, r.Body)
	}
}

// join opens the invite link signed out, then signs up — the customer path.
func (b *browser) join(invitePath, name, email string) {
	b.app.t.Helper()
	token := strings.TrimPrefix(invitePath, "/join/")
	if landing := b.get("/api/invitations/" + token); landing.str("outcome") != "landing" {
		b.app.t.Fatalf("invite landing: %v", landing.Body)
	}
	r := b.post("/api/registration", map[string]any{"name": name, "email_address": email, "password": "password"})
	if r.Status != 200 {
		b.app.t.Fatalf("join: %d %v", r.Status, r.Body)
	}
}

func (b *browser) signIn(email string) response {
	return b.post("/api/session", map[string]any{"email_address": email, "password": "password"})
}

// addCustomer adds someone with a phone of their own, made up from a count:
// a shop's book holds one customer per phone.
func (b *browser) addCustomer(name string) int64 {
	b.app.t.Helper()
	b.app.phones++
	return b.addCustomerWithPhone(name, fmt.Sprintf("17%06d", b.app.phones))
}

func (b *browser) addCustomerWithPhone(name, phone string) int64 {
	b.app.t.Helper()
	r := b.post("/api/accounts", map[string]any{"customer_name": name, "customer_phone": phone})
	if r.Status != 200 {
		b.app.t.Fatalf("add customer: %d %v", r.Status, r.Body)
	}
	return r.num("account_id")
}

func (b *browser) balance(accountID int64) int64 {
	return b.get(fmt.Sprintf("/api/accounts/%d", accountID)).num("account.balance_cents")
}

func (b *browser) invitePath(accountID int64) string {
	return b.get(fmt.Sprintf("/api/accounts/%d/invite", accountID)).str("invite_path")
}

func screenshot(t *testing.T) []byte {
	data, err := os.ReadFile("../../db/seed_assets/transfer_screenshot.png")
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// ---------------------------------------------------------- assertions

func equal[T comparable](t *testing.T, got, want T, what string) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %v, want %v", what, got, want)
	}
}

// storedFiles counts the files this app has on disk.
func (a *app) storedFiles() int {
	count := 0
	_ = filepath.WalkDir(a.files, func(_ string, entry fs.DirEntry, err error) error {
		if err == nil && !entry.IsDir() {
			count++
		}
		return nil
	})
	return count
}
