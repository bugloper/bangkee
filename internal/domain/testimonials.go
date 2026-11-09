package domain

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/store"
)

// Testimonials: what shop owners and customers say about Bangkee, shown on
// the homepage once the operator approves them. One each; rewriting one
// sends it back for review. Status: pending 0, approved 1, hidden 2.

const (
	TestimonialPending  int32 = 0
	TestimonialApproved int32 = 1
	TestimonialHidden   int32 = 2

	minTestimonialRunes = 20
	maxTestimonialRunes = 300
)

func testimonialStatusKey(status int32) string {
	switch status {
	case TestimonialApproved:
		return "approved"
	case TestimonialHidden:
		return "hidden"
	}
	return "pending"
}

func TestimonialStatusValue(key string) (int32, bool) {
	switch key {
	case "pending":
		return TestimonialPending, true
	case "approved":
		return TestimonialApproved, true
	case "hidden":
		return TestimonialHidden, true
	}
	return 0, false
}

// TestimonialDTO is someone's own testimonial, as they see it on their Profile.
type TestimonialDTO struct {
	ID        int64     `json:"id"`
	Body      string    `json:"body"`
	Status    string    `json:"status"`
	UpdatedAt time.Time `json:"updated_at"`
}

// MyTestimonial is the user's testimonial, or nil when they have not written one.
func MyTestimonial(ctx context.Context, q *store.Queries, userID int64) (*TestimonialDTO, error) {
	t, err := q.TestimonialForUser(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &TestimonialDTO{ID: t.ID, Body: t.Body, Status: testimonialStatusKey(t.Status), UpdatedAt: t.UpdatedAt}, nil
}

// SaveTestimonial checks and stores what the user wrote; it waits for review.
func SaveTestimonial(ctx context.Context, q *store.Queries, userID int64, body string) (int64, error) {
	body = strings.Join(strings.Fields(body), " ")
	var errs apperr.Errors
	errs.Check(utf8.RuneCountInString(body) >= minTestimonialRunes, "Say a little more (at least 20 characters)")
	errs.Check(utf8.RuneCountInString(body) <= maxTestimonialRunes, "Keep it short (at most 300 characters)")
	if err := errs.Err(); err != nil {
		return 0, err
	}
	return q.SaveTestimonial(ctx, store.SaveTestimonialParams{UserID: userID, Body: body})
}

// PublicTestimonial is one approved testimonial as the homepage shows it:
// the words, the person's name, and who they are.
type PublicTestimonial struct {
	ID   int64  `json:"id"`
	Body string `json:"body"`
	Name string `json:"name"`
	// "Karma General Shop, Thimphu" for an owner; "Customer" for a customer.
	Role  string `json:"role"`
	Owner bool   `json:"owner"`
}

func PublicTestimonialView(row store.ApprovedTestimonialsRow) PublicTestimonial {
	view := PublicTestimonial{ID: row.ID, Body: row.Body, Name: row.UserName, Role: "Customer"}
	if row.UserRole == RoleShopOwner && row.ShopName != "" {
		view.Owner = true
		view.Role = row.ShopName
		if row.ShopLocation != "" {
			view.Role += ", " + row.ShopLocation
		}
	}
	return view
}

// AdminTestimonialDTO is a testimonial as the operator reviews it.
type AdminTestimonialDTO struct {
	TestimonialDTO
	From struct {
		Name  string  `json:"name"`
		Email *string `json:"email"`
		Phone *string `json:"phone"`
		Role  string  `json:"role"`
		Shop  *string `json:"shop"`
	} `json:"from"`
	ReviewedByName *string    `json:"reviewed_by_name"`
	ReviewedAt     *time.Time `json:"reviewed_at"`
}

func AdminTestimonialView(row store.TestimonialQueueRow) AdminTestimonialDTO {
	t := row.Testimonial
	view := AdminTestimonialDTO{
		TestimonialDTO: TestimonialDTO{ID: t.ID, Body: t.Body, Status: testimonialStatusKey(t.Status), UpdatedAt: t.UpdatedAt},
		ReviewedByName: row.ReviewedByName, ReviewedAt: t.ReviewedAt,
	}
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

// ReviewTestimonial approves or hides one. False when there is no such testimonial.
func ReviewTestimonial(ctx context.Context, q *store.Queries, id int64, status int32, by int64) (bool, error) {
	n, err := q.ReviewTestimonial(ctx, store.ReviewTestimonialParams{ID: id, Status: status, ReviewedByID: &by})
	if err != nil || n == 0 {
		return false, err
	}
	action := "approved"
	if status == TestimonialHidden {
		action = "hidden"
	}
	return true, Audit(ctx, q, "Testimonial", id, action, &by, nil)
}
