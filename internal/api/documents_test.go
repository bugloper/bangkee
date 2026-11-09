package api_test

import (
	"context"
	"fmt"
	"testing"
)

// Files on entries: photos and PDFs only (by what they are, not what they
// claim), five to an entry, opened by the shop and that customer only, and
// gone from disk when removed or when the customer leaves the book.
func TestEntriesCarryPrivateFiles(t *testing.T) {
	a := newApp(t)
	owner := a.browser()
	owner.openShop("Karma", "karma@shop.bt")
	account := owner.addCustomer("Pema")
	entry := owner.post(fmt.Sprintf("/api/accounts/%d/credits", account), map[string]any{"amount": "500"}).num("transaction_id")
	path := fmt.Sprintf("/api/transactions/%d/documents", entry)

	pdf := []byte("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n")
	equal(t, owner.multipart(path, nil, "file", screenshot(t)).Status, 200, "a photo")
	equal(t, owner.multipart(path, nil, "file", pdf).Status, 200, "a PDF (sent as image/png, recognised as a PDF)")
	fake := owner.multipart(path, nil, "file", []byte("<html><script>alert(1)</script></html>"))
	equal(t, fake.Status, 422, "a web page calling itself a PNG is refused")
	equal(t, a.storedFiles(), 2, "two files on disk")

	ledger := owner.get(fmt.Sprintf("/api/accounts/%d", account))
	equal(t, ledger.len("ledger.0.documents"), 2, "listed on the entry")
	equal(t, ledger.str("ledger.0.documents.1.content_type"), "application/pdf", "its real type")
	url := ledger.str("ledger.0.documents.1.url")
	status, header, _ := owner.raw(url)
	equal(t, status, 200, "the shop opens it")
	equal(t, header.Get("X-Content-Type-Options"), "nosniff", "never sniffed")

	for i := 0; i < 3; i++ {
		owner.multipart(path, nil, "file", screenshot(t))
	}
	equal(t, owner.multipart(path, nil, "file", screenshot(t)).Status, 422, "five to an entry")

	pema := a.browser()
	pema.join(owner.invitePath(account), "Pema", "pema@example.bt")
	status, _, _ = pema.raw(url)
	equal(t, status, 200, "the customer opens it")
	equal(t, pema.multipart(path, nil, "file", screenshot(t)).Status, 403, "customers do not attach to the shop's entries")
	other := a.browser()
	other.openShop("Dorji", "dorji@shop.bt")
	status, _, _ = other.raw(url)
	equal(t, status, 404, "another shop cannot")
	equal(t, other.multipart(path, nil, "file", screenshot(t)).Status, 404, "nor attach")
	status, _, _ = a.browser().raw(url)
	equal(t, status, 401, "nor a stranger")

	// Removing one deletes the file; removing the customer deletes the rest.
	docID := ledger.num("ledger.0.documents.0.id")
	equal(t, other.delete(fmt.Sprintf("%s/%d", path, docID)).Status, 404, "another shop cannot remove it")
	equal(t, owner.delete(fmt.Sprintf("%s/%d", path, docID)).Status, 200, "removed")
	equal(t, a.storedFiles(), 4, "its file is gone")
	owner.post(fmt.Sprintf("/api/accounts/%d/payments", account), map[string]any{"amount": "500"})
	equal(t, owner.delete(fmt.Sprintf("/api/accounts/%d", account)).Status, 200, "the customer leaves the book")
	equal(t, a.storedFiles(), 0, "no file is left behind")

	// After the trial, files are a Pro feature.
	again := owner.addCustomer("Sonam")
	e2 := owner.post(fmt.Sprintf("/api/accounts/%d/credits", again), map[string]any{"amount": "10"}).num("transaction_id")
	_, _ = a.DB.Exec(context.Background(), "UPDATE subscriptions SET status = 1, plan = 'basic', current_period_end = now() + interval '300 days'")
	refused := owner.multipart(fmt.Sprintf("/api/transactions/%d/documents", e2), nil, "file", screenshot(t))
	equal(t, refused.Status, 403, "not on Basic")
	equal(t, refused.str("code"), "plan_required", "a plan is needed")
}
