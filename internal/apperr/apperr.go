// Package apperr is the error every handler and domain function returns,
// rendered as the JSON shapes in web/src/api/types.ts (ApiErrorBody). The
// messages are the Rails flash alerts, word for word, because the client
// shows them as they arrive.
package apperr

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

const WriteLockedMessage = "Your subscription is inactive — renew it to record credits and payments again."

type Kind int

const (
	Unauthenticated Kind = iota
	// Forbidden: signed in, but this is not theirs (wrong role, someone else's account).
	Forbidden
	// WriteLocked: BR-40, the grace period is over; reads still work, writes do not.
	WriteLocked
	NotFound
	// Validation: messages are full sentences ("Customer name can't be blank").
	Validation
	// Rule: a business rule said no ("That transaction was already voided.").
	Rule
	RateLimited
)

type Error struct {
	Kind     Kind
	Message  string
	Messages []string
}

func (e *Error) Error() string {
	if e.Kind == Validation {
		return "validation failed"
	}
	return e.Message
}

func NewForbidden(message string) error   { return &Error{Kind: Forbidden, Message: message} }
func NewRule(message string) error        { return &Error{Kind: Rule, Message: message} }
func NewNotFound(message string) error    { return &Error{Kind: NotFound, Message: message} }
func NewRateLimited(message string) error { return &Error{Kind: RateLimited, Message: message} }
func NewValidation(messages ...string) error {
	return &Error{Kind: Validation, Messages: messages}
}

var (
	ErrUnauthenticated = &Error{Kind: Unauthenticated, Message: "unauthenticated"}
	ErrWriteLocked     = &Error{Kind: WriteLocked, Message: WriteLockedMessage}
	ErrNotFound        = &Error{Kind: NotFound, Message: "Not found"}
)

// Render maps any error to its status and body. A missing row is a 404;
// anything that is not an *Error is an internal failure, reported vaguely.
func Render(err error) (int, map[string]any, bool) {
	if errors.Is(err, pgx.ErrNoRows) {
		return http.StatusNotFound, map[string]any{"error": "Not found"}, false
	}
	var appErr *Error
	if !errors.As(err, &appErr) {
		return http.StatusInternalServerError, map[string]any{"error": "Something went wrong on our side."}, true
	}
	switch appErr.Kind {
	case Unauthenticated:
		return http.StatusUnauthorized, map[string]any{"error": "unauthenticated", "code": "unauthenticated"}, false
	case Forbidden:
		return http.StatusForbidden, map[string]any{"error": appErr.Message}, false
	case WriteLocked:
		return http.StatusForbidden, map[string]any{"error": appErr.Message, "code": "write_locked"}, false
	case NotFound:
		return http.StatusNotFound, map[string]any{"error": appErr.Message}, false
	case Validation:
		return http.StatusUnprocessableEntity, map[string]any{"errors": appErr.Messages}, false
	case RateLimited:
		return http.StatusTooManyRequests, map[string]any{"error": appErr.Message}, false
	default:
		return http.StatusUnprocessableEntity, map[string]any{"error": appErr.Message}, false
	}
}

// Errors collects validation messages the way ActiveRecord's `errors` does,
// so a form can show every problem at once rather than one per submit.
type Errors struct{ messages []string }

func (e *Errors) Add(message string) { e.messages = append(e.messages, message) }

func (e *Errors) Check(ok bool, message string) {
	if !ok {
		e.Add(message)
	}
}

func (e *Errors) Any() bool { return len(e.messages) > 0 }

// Err is nil when nothing was added.
func (e *Errors) Err() error {
	if len(e.messages) == 0 {
		return nil
	}
	return NewValidation(e.messages...)
}
