// Package util holds the small helpers the Rails app got from ActiveSupport.
package util

import (
	"crypto/rand"
	"strings"
	"time"
	"unicode"
)

const (
	base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	base36 = "0123456789abcdefghijklmnopqrstuvwxyz"
)

func randomString(alphabet string, length int) string {
	// Rejection sampling keeps every character equally likely.
	limit := 256 - 256%len(alphabet)
	out := make([]byte, 0, length)
	buf := make([]byte, 32)
	for len(out) < length {
		_, _ = rand.Read(buf)
		for _, b := range buf {
			if int(b) < limit && len(out) < length {
				out = append(out, alphabet[int(b)%len(alphabet)])
			}
		}
	}
	return string(out)
}

// SecureToken is has_secure_token's shape: 24 characters of base58. Invite
// links, table cards and session cookies all use it.
func SecureToken() string { return randomString(base58, 24) }

// BlobKey is Active Storage's blob key shape: 28 characters of lowercase base36.
func BlobKey() string { return randomString(base36, 28) }

// Presence is ActiveSupport's `presence` for strings: trimmed, nil when empty.
func Presence(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// Present reports whether a trimmed string has anything in it.
func Present(value string) bool { return strings.TrimSpace(value) != "" }

// Deref reads an optional string, empty when absent.
func Deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// FirstUpper is the avatar initial.
func FirstUpper(value string) string {
	for _, r := range value {
		return string(unicode.ToUpper(r))
	}
	return ""
}

// ParseTime reads a form's date. `<input type="datetime-local">` sends
// "2026-09-29T10:30" with no zone, which Rails read as UTC (no time zone was
// configured); the offline queue sends a full ISO timestamp. Blank is nil.
func ParseTime(value string) (*time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, true
	}
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04", "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			utc := parsed.UTC()
			return &utc, true
		}
	}
	return nil, false
}

// LongDate is `%-d %b %Y` — "4 Oct 2026".
func LongDate(t time.Time) string { return t.UTC().Format("2 Jan 2006") }

// MonthStart is the first instant of the current UTC month (`all_month`).
func MonthStart(now time.Time) time.Time {
	now = now.UTC()
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
}

// Ptr makes a pointer of any value.
func Ptr[T any](value T) *T { return &value }
