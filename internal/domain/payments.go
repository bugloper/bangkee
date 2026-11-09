package domain

import (
	"context"
	"crypto/md5"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"bangkee/internal/apperr"
	"bangkee/internal/money"
	"bangkee/internal/storage"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// ------------------------------------------------------------- attachments
//
// Active Storage's two tables, read and written the way Rails did: a blob per
// file, an attachment row tying it to a record by class name and field name.

var AcceptedImageTypes = []string{"image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"}

const MaxUploadBytes = 8 * 1024 * 1024

// Upload is a file that arrived in a multipart form, not yet stored.
type Upload struct {
	Filename    string
	ContentType string
	Data        []byte
}

// ValidateImage is AttachableImage: one rule, reported under the field's name.
func ValidateImage(field string, upload *Upload, errs *apperr.Errors) {
	if upload == nil {
		errs.Add(field + " must be attached")
		return
	}
	accepted := false
	for _, t := range AcceptedImageTypes {
		accepted = accepted || upload.ContentType == t
	}
	errs.Check(accepted, field+" must be a PNG, JPEG, WebP or HEIC image")
	errs.Check(len(upload.Data) <= MaxUploadBytes, field+" must be smaller than 8 MB")
}

// CreateBlob stores the file first, then records the blob — a row must
// never point at a file that is not there.
func CreateBlob(ctx context.Context, q *store.Queries, files *storage.Storage, upload Upload) (int64, error) {
	key := util.BlobKey()
	if err := files.Put(ctx, key, upload.ContentType, upload.Data); err != nil {
		return 0, err
	}
	sum := md5.Sum(upload.Data)
	return q.CreateBlob(ctx, store.CreateBlobParams{
		Key: key, Filename: upload.Filename, ContentType: &upload.ContentType, ServiceName: files.ServiceName(),
		ByteSize: int64(len(upload.Data)), Checksum: util.Ptr(base64.StdEncoding.EncodeToString(sum[:])),
	})
}

func Attach(ctx context.Context, q *store.Queries, recordType string, recordID int64, name string, blobID int64) error {
	_, err := q.Attach(ctx, store.AttachParams{Name: name, RecordType: recordType, RecordID: recordID, BlobID: blobID})
	return err
}

// AttachmentURLs maps each record id to the URL of its file, which is what
// the client asks for.
func AttachmentURLs(ctx context.Context, q *store.Queries, recordType string, ids []int64, name string) (map[int64]string, error) {
	rows, err := q.AttachmentIDs(ctx, store.AttachmentIDsParams{RecordType: recordType, RecordIds: ids, Name: name})
	if err != nil {
		return nil, err
	}
	out := map[int64]string{}
	for _, row := range rows {
		out[row.RecordID] = AttachmentURL(row.ID)
	}
	return out, nil
}

func AttachmentURL(id int64) string { return fmt.Sprintf("/api/attachments/%d", id) }

// detachFiles removes records' attachments of one name and their blob rows,
// returning the files' keys to delete once the transaction has committed.
func detachFiles(ctx context.Context, q *store.Queries, recordType string, recordIDs []int64, name string) ([]string, error) {
	blobs, err := q.AttachedBlobs(ctx, store.AttachedBlobsParams{RecordType: recordType, RecordIds: recordIDs, Name: name})
	if err != nil || len(blobs) == 0 {
		return nil, err
	}
	if err := q.DetachAll(ctx, store.DetachAllParams{RecordType: recordType, RecordIds: recordIDs}); err != nil {
		return nil, err
	}
	ids := make([]int64, len(blobs))
	keys := make([]string, len(blobs))
	for i, b := range blobs {
		ids[i], keys[i] = b.ID, b.Key
	}
	return keys, q.DeleteBlobs(ctx, ids)
}

func optionalURL(urls map[int64]string, id int64) *string {
	if url, ok := urls[id]; ok {
		return &url
	}
	return nil
}

// ------------------------------------------------------------ bank details

type BankAccountDTO struct {
	ID            int64   `json:"id"`
	BankName      string  `json:"bank_name"`
	AccountName   string  `json:"account_name"`
	AccountNumber string  `json:"account_number"`
	Branch        *string `json:"branch"`
	Instructions  *string `json:"instructions"`
	Primary       bool    `json:"primary"`
	Active        bool    `json:"active"`
}

func BankAccountView(b store.BankAccount) BankAccountDTO {
	return BankAccountDTO{
		ID: b.ID, BankName: b.BankName, AccountName: b.AccountName, AccountNumber: b.AccountNumber, Branch: b.Branch,
		Instructions: b.Instructions, Primary: b.Primary, Active: b.Active,
	}
}

// BankAccounts lists primary first, then oldest first.
func BankAccounts(ctx context.Context, q *store.Queries, shopID int64, activeOnly bool) ([]BankAccountDTO, error) {
	rows, err := q.BankAccountsForShop(ctx, store.BankAccountsForShopParams{ShopID: shopID, ActiveOnly: activeOnly})
	if err != nil {
		return nil, err
	}
	out := make([]BankAccountDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, BankAccountView(row))
	}
	return out, nil
}

type BankAccountInput struct {
	BankName      string `json:"bank_name"`
	AccountName   string `json:"account_name"`
	AccountNumber string `json:"account_number"`
	Branch        string `json:"branch"`
	Instructions  string `json:"instructions"`
	Primary       bool   `json:"primary"`
	Active        *bool  `json:"active"`
}

func (in BankAccountInput) validate() error {
	var errs apperr.Errors
	errs.Check(util.Present(in.BankName), "Bank name can't be blank")
	errs.Check(util.Present(in.AccountName), "Account name can't be blank")
	errs.Check(util.Present(in.AccountNumber), "Account number can't be blank")
	return errs.Err()
}

func (in BankAccountInput) active() bool { return in.Active == nil || *in.Active }

// SaveBankAccount creates (id 0) or updates. BR-27: at most one primary per shop.
func SaveBankAccount(ctx context.Context, q *store.Queries, shopID, id int64, in BankAccountInput) error {
	if err := in.validate(); err != nil {
		return err
	}
	trim := strings.TrimSpace
	var err error
	if id == 0 {
		id, err = q.CreateBankAccount(ctx, store.CreateBankAccountParams{
			ShopID: shopID, BankName: trim(in.BankName), AccountName: trim(in.AccountName), AccountNumber: trim(in.AccountNumber),
			Branch: util.Presence(in.Branch), Instructions: util.Presence(in.Instructions),
			Primary: in.Primary, Active: in.active(),
		})
	} else {
		err = q.UpdateBankAccount(ctx, store.UpdateBankAccountParams{
			ShopID: shopID, ID: id, BankName: trim(in.BankName), AccountName: trim(in.AccountName), AccountNumber: trim(in.AccountNumber),
			Branch: util.Presence(in.Branch), Instructions: util.Presence(in.Instructions),
			Primary: in.Primary, Active: in.active(),
		})
	}
	if err != nil || !in.Primary {
		return err
	}
	return q.DemoteOtherPrimaries(ctx, store.DemoteOtherPrimariesParams{ShopID: shopID, ID: id})
}

// --------------------------------------------------------- billing payments
//
// §17 — a shop owner's manual payment to the Bangkee operator, reviewed by a
// platform admin. Status: pending 0, approved 1, rejected 2.

const SubscriptionPaymentRecordType = "SubscriptionPayment"

func SubscriptionPaymentStatusValue(key string) (int32, bool) {
	switch key {
	case "pending":
		return 0, true
	case "approved":
		return 1, true
	case "rejected":
		return 2, true
	}
	return 0, false
}

type SubscriptionPaymentDTO struct {
	ID              int64      `json:"id"`
	Plan            string     `json:"plan"`
	PlanName        string     `json:"plan_name"`
	AmountCents     int64      `json:"amount_cents"`
	Months          int32      `json:"months"`
	PaymentMethod   *string    `json:"payment_method"`
	Reference       *string    `json:"reference"`
	Status          string     `json:"status"`
	RejectionReason *string    `json:"rejection_reason"`
	CreatedAt       time.Time  `json:"created_at"`
	ReviewedAt      *time.Time `json:"reviewed_at"`
	ReviewedByName  *string    `json:"reviewed_by_name"`
	ScreenshotURL   *string    `json:"screenshot_url"`
}

func SubscriptionPaymentView(p store.SubscriptionPayment, reviewedBy *string, shot *string) SubscriptionPaymentDTO {
	return SubscriptionPaymentDTO{
		ID: p.ID, Plan: p.Plan, PlanName: planName(p.Plan), AmountCents: p.AmountCents, Months: p.Months, PaymentMethod: p.Method, Reference: p.Reference,
		Status: [...]string{"pending", "approved", "rejected"}[p.Status], RejectionReason: p.RejectionReason,
		CreatedAt: p.CreatedAt, ReviewedAt: p.ReviewedAt, ReviewedByName: reviewedBy, ScreenshotURL: shot,
	}
}

type NewSubscriptionPayment struct {
	Amount, Months, Method, Reference string
	Plan                              string // basic | pro | business: what the year buys
}

func CreateSubscriptionPayment(ctx context.Context, q *store.Queries, files *storage.Storage, shopID, by int64, in NewSubscriptionPayment, upload *Upload) (int64, int64, int32, error) {
	var errs apperr.Errors
	amount, ok := money.ParseCents(in.Amount)
	errs.Check(ok && amount > 0, "Amount must be greater than 0")
	// Billed annually: a payment buys a year unless it says otherwise.
	monthsText := strings.TrimSpace(in.Months)
	if monthsText == "" {
		monthsText = "12"
	}
	months, err := strconv.Atoi(monthsText)
	errs.Check(err == nil && months >= 1, "Months must be greater than or equal to 1")
	_, known := PlanByKey(in.Plan)
	errs.Check(known, "Choose a plan")
	ValidateImage("Screenshot", upload, &errs)
	if err := errs.Err(); err != nil {
		return 0, 0, 0, err
	}
	blob, err := CreateBlob(ctx, q, files, *upload)
	if err != nil {
		return 0, 0, 0, err
	}
	id, err := q.CreateSubscriptionPayment(ctx, store.CreateSubscriptionPaymentParams{
		ShopID: shopID, SubmittedByID: by, AmountCents: amount, Months: int32(months),
		Method: util.Presence(in.Method), Reference: util.Presence(in.Reference), Plan: in.Plan,
	})
	if err != nil {
		return 0, 0, 0, err
	}
	return id, amount, int32(months), Attach(ctx, q, SubscriptionPaymentRecordType, id, "screenshot", blob)
}

// ApproveSubscriptionPayment is BR-43/BR-45. Returns the new paid-through
// date, or nil when it had already been reviewed. The shop moves onto the
// plan the payment was for straight away, and the months are added to its
// cover. A shop staying on its plan keeps the price it had; one changing
// plan takes the plan's price now (planPrice).
func ApproveSubscriptionPayment(ctx context.Context, q *store.Queries, p store.SubscriptionPayment, by int64, planPrice func(string) int64) (*time.Time, error) {
	if p.Status != 0 {
		return nil, nil
	}
	if err := q.ApproveSubscriptionPayment(ctx, store.ApproveSubscriptionPaymentParams{ID: p.ID, ReviewedByID: &by}); err != nil {
		return nil, err
	}
	sub, err := SubscriptionFor(ctx, q, p.ShopID)
	if err != nil || sub == nil {
		return nil, err
	}
	paidThrough, err := ExtendPeriod(ctx, q, *sub, p.Months, &by)
	if err != nil {
		return nil, err
	}
	if p.Plan != sub.Plan {
		if err := q.SetSubscriptionPlan(ctx, store.SetSubscriptionPlanParams{ID: sub.ID, Plan: p.Plan, PriceCents: planPrice(p.Plan)}); err != nil {
			return nil, err
		}
		if err := Audit(ctx, q, "Subscription", sub.ID, "plan_changed", &by, map[string]any{"from": sub.Plan, "to": p.Plan}); err != nil {
			return nil, err
		}
	}
	return &paidThrough, Audit(ctx, q, SubscriptionPaymentRecordType, p.ID, "approved", &by,
		map[string]any{"amount_cents": p.AmountCents, "months": p.Months})
}

// RejectSubscriptionPayment is BR-44.
func RejectSubscriptionPayment(ctx context.Context, q *store.Queries, p store.SubscriptionPayment, by int64, reason string) (string, error) {
	if p.Status != 0 {
		return "", nil
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "No reason given"
	}
	if err := q.RejectSubscriptionPayment(ctx, store.RejectSubscriptionPaymentParams{ID: p.ID, ReviewedByID: &by, RejectionReason: &reason}); err != nil {
		return "", err
	}
	return reason, Audit(ctx, q, SubscriptionPaymentRecordType, p.ID, "rejected", &by, map[string]any{"reason": reason})
}
