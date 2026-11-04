package domain

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
)

// Feedback is what shop owners and customers send Bangkee from their
// Profile, and what the operator answers on the console. Status: new 0,
// acknowledged 1, replied 2.

const (
	FeedbackNew          int32 = 0
	FeedbackAcknowledged int32 = 1
	FeedbackReplied      int32 = 2

	// A message long enough to explain a problem, short enough to read.
	maxFeedbackRunes = 2000
	maxReplyRunes    = 2000
)

type FeedbackKind struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// FeedbackKinds in the order the form offers them.
var FeedbackKinds = []FeedbackKind{
	{"feedback", "Feedback"},
	{"feature", "Feature request"},
	{"support", "Support"},
}

func FeedbackKindLabel(key string) string {
	for _, k := range FeedbackKinds {
		if k.Key == key {
			return k.Label
		}
	}
	return "Feedback"
}

func feedbackStatusKey(status int32) string {
	switch status {
	case FeedbackAcknowledged:
		return "acknowledged"
	case FeedbackReplied:
		return "replied"
	}
	return "new"
}

func FeedbackStatusValue(key string) (int32, bool) {
	switch key {
	case "new":
		return FeedbackNew, true
	case "acknowledged":
		return FeedbackAcknowledged, true
	case "replied":
		return FeedbackReplied, true
	}
	return 0, false
}

type FeedbackDTO struct {
	ID             int64      `json:"id"`
	Kind           string     `json:"kind"`
	KindLabel      string     `json:"kind_label"`
	Body           string     `json:"body"`
	Status         string     `json:"status"`
	Reply          *string    `json:"reply"`
	CreatedAt      time.Time  `json:"created_at"`
	AcknowledgedAt *time.Time `json:"acknowledged_at"`
	RepliedAt      *time.Time `json:"replied_at"`
}

func FeedbackView(f store.Feedback) FeedbackDTO {
	return FeedbackDTO{
		ID: f.ID, Kind: f.Kind, KindLabel: FeedbackKindLabel(f.Kind), Body: f.Body, Status: feedbackStatusKey(f.Status),
		Reply: f.Reply, CreatedAt: f.CreatedAt, AcknowledgedAt: f.AcknowledgedAt, RepliedAt: f.RepliedAt,
	}
}

// AdminFeedbackDTO is a message as the operator reads it: who sent it and how to reach them.
type AdminFeedbackDTO struct {
	FeedbackDTO
	From struct {
		Name  string  `json:"name"`
		Email *string `json:"email"`
		Phone *string `json:"phone"`
		Role  string  `json:"role"`
		Shop  *string `json:"shop"`
	} `json:"from"`
	ReviewedByName *string `json:"reviewed_by_name"`
}

func AdminFeedbackView(row store.FeedbackListRow) AdminFeedbackDTO {
	view := AdminFeedbackDTO{FeedbackDTO: FeedbackView(row.Feedback), ReviewedByName: row.ReviewedByName}
	view.From.Name, view.From.Email, view.From.Phone = row.UserName, row.UserEmail, row.UserPhone
	view.From.Role = "customer"
	if row.UserRole == RoleShopOwner {
		view.From.Role = "shop_owner"
	}
	if row.ShopName != "" {
		view.From.Shop = &row.ShopName
	}
	return view
}

// SendFeedback checks and stores a message. It returns the new id and the
// trimmed body.
func SendFeedback(ctx context.Context, q *store.Queries, userID int64, kind, body string) (int64, string, error) {
	var errs apperr.Errors
	known := false
	for _, k := range FeedbackKinds {
		known = known || k.Key == kind
	}
	errs.Check(known, "Choose feedback, a feature request or support")
	body = strings.TrimSpace(body)
	errs.Check(body != "", "Message can't be blank")
	errs.Check(utf8.RuneCountInString(body) <= maxFeedbackRunes, "Message is too long (at most 2000 characters)")
	if err := errs.Err(); err != nil {
		return 0, "", err
	}
	id, err := q.CreateFeedback(ctx, store.CreateFeedbackParams{UserID: userID, Kind: kind, Body: body})
	return id, body, err
}

// AcknowledgeFeedback marks a new message seen. False when it already was.
func AcknowledgeFeedback(ctx context.Context, q *store.Queries, f store.Feedback, by int64) (bool, error) {
	if f.Status != FeedbackNew {
		return false, nil
	}
	if err := q.AcknowledgeFeedback(ctx, store.AcknowledgeFeedbackParams{ID: f.ID, ReviewedByID: &by}); err != nil {
		return false, err
	}
	return true, Audit(ctx, q, "Feedback", f.ID, "acknowledged", &by, nil)
}

// ReplyToFeedback answers a message. One reply each: false when it already has one.
func ReplyToFeedback(ctx context.Context, q *store.Queries, f store.Feedback, by int64, reply string) (bool, string, error) {
	reply = strings.TrimSpace(reply)
	var errs apperr.Errors
	errs.Check(reply != "", "Reply can't be blank")
	errs.Check(utf8.RuneCountInString(reply) <= maxReplyRunes, "Reply is too long (at most 2000 characters)")
	if err := errs.Err(); err != nil {
		return false, "", err
	}
	if f.Status == FeedbackReplied {
		return false, "", nil
	}
	if err := q.ReplyToFeedback(ctx, store.ReplyToFeedbackParams{ID: f.ID, ReviewedByID: &by, Reply: &reply}); err != nil {
		return false, "", err
	}
	return true, reply, Audit(ctx, q, "Feedback", f.ID, "replied", &by, nil)
}
