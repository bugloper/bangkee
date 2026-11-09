// Package money: integer chetrum everywhere (BR-1). What people type is major
// units with optional thousands separators, and the rounding rule is the one
// Ruby's BigDecimal#round used: half away from zero.
package money

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/shopspring/decimal"
)

var hundred = decimal.NewFromInt(100)

// ParseCents turns "1,250.50" into 125050. ok is false for blank or
// unparseable input, which callers report as a validation error.
func ParseCents(input string) (int64, bool) {
	cleaned := strings.TrimSpace(strings.ReplaceAll(input, ",", ""))
	if cleaned == "" {
		return 0, false
	}
	value, err := decimal.NewFromString(cleaned)
	if err != nil {
		return 0, false
	}
	return value.Mul(hundred).Round(0).IntPart(), true
}

// ParseQuantity reads a quantity as typed ("2", "1.5"), stored numeric(10,2).
func ParseQuantity(input string) (decimal.Decimal, bool) {
	cleaned := strings.TrimSpace(input)
	if cleaned == "" {
		return decimal.Zero, false
	}
	value, err := decimal.NewFromString(cleaned)
	if err != nil {
		return decimal.Zero, false
	}
	return value.Round(2), true
}

// LineTotal is quantity × unit price, rounded to the chetrum (BR-13).
// decimal.Round is half away from zero, like PostgreSQL's ROUND on numeric.
func LineTotal(quantity decimal.Decimal, unitPriceCents int64) int64 {
	return quantity.Mul(decimal.NewFromInt(unitPriceCents)).Round(0).IntPart()
}

// QuantityLabel is Ruby's `quantity.to_s.sub(/\.0+$/, "")`: "2.00" -> "2", "1.50" -> "1.5".
func QuantityLabel(quantity decimal.Decimal) string {
	return quantity.String()
}

// MajorUnits puts cents back into what a form field would hold: 12000 -> "120".
func MajorUnits(cents int64) string {
	return decimal.New(cents, -2).String()
}

// Ngultrum is ApplicationHelper#ngultrum (BR-3). Whole amounts drop the
// decimals ("Nu. 1,250"); fractional amounts keep two. Negative amounts get
// a real minus sign; signed adds "+ " to positives too.
func Ngultrum(cents int64, signed bool) string {
	abs := cents
	if abs < 0 {
		abs = -abs
	}
	formatted := "Nu. " + delimit(abs/100)
	if fraction := abs % 100; fraction != 0 {
		formatted += fmt.Sprintf(".%02d", fraction)
	}
	switch {
	case cents < 0:
		return "− " + formatted
	case signed && cents > 0:
		return "+ " + formatted
	default:
		return formatted
	}
}

func delimit(value int64) string {
	digits := strconv.FormatInt(value, 10)
	var out strings.Builder
	for i, digit := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out.WriteByte(',')
		}
		out.WriteRune(digit)
	}
	return out.String()
}

// Pluralize is ActiveSupport's pluralize for the English nouns Bangkee uses.
func Pluralize(count int64, singular string) string {
	if count == 1 {
		return "1 " + singular
	}
	// entry → entries, but day → days.
	if n := len(singular); n > 1 && singular[n-1] == 'y' && !strings.ContainsRune("aeiou", rune(singular[n-2])) {
		return fmt.Sprintf("%d %sies", count, singular[:n-1])
	}
	return fmt.Sprintf("%d %ss", count, singular)
}
