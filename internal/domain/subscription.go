package domain

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"bangkee/internal/money"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// §17 — one subscription per shop. The stored `status` is a cache: what
// governs access is derived from server time every time it is asked (BR-37),
// so a clock on the client can never buy anyone an extra day.

const (
	TrialDays = 14
	GraceDays = 14
)

type SubStatus int32

const (
	Trialing SubStatus = 0
	Active   SubStatus = 1
	PastDue  SubStatus = 2
	Disabled SubStatus = 3
)

func (s SubStatus) key() string {
	return [...]string{"trialing", "active", "past_due", "disabled"}[s]
}

func (s SubStatus) Label() string {
	return [...]string{"Free trial", "Active", "Payment due", "Inactive"}[s]
}

// EffectiveStatus is BR-37 — the authority on access.
func EffectiveStatus(s store.Subscription, now time.Time) SubStatus {
	switch {
	case !now.After(s.CurrentPeriodEnd):
		if s.Status == int32(Trialing) {
			return Trialing
		}
		return Active
	case s.GraceUntil != nil && !now.After(*s.GraceUntil):
		return PastDue
	default:
		return Disabled
	}
}

func WriteLocked(s store.Subscription) bool { return EffectiveStatus(s, time.Now()) == Disabled }

func ceilDays(until, now time.Time) int64 {
	seconds := int64(until.Sub(now).Seconds())
	if seconds <= 0 {
		return 0
	}
	return (seconds + 86_399) / 86_400
}

func DaysRemaining(s store.Subscription) int64 { return ceilDays(s.CurrentPeriodEnd, time.Now()) }

func GraceDaysRemaining(s store.Subscription) int64 {
	if s.GraceUntil == nil {
		return 0
	}
	return ceilDays(*s.GraceUntil, time.Now())
}

// Summary is one sentence describing where a shop stands.
func Summary(s store.Subscription) string {
	switch EffectiveStatus(s, time.Now()) {
	case Trialing:
		return money.Pluralize(DaysRemaining(s), "day") + " of free trial left"
	case Active:
		return "Renews " + util.LongDate(s.CurrentPeriodEnd)
	case PastDue:
		return money.Pluralize(GraceDaysRemaining(s), "day") + " left before writing is locked"
	default:
		return "Write actions are locked"
	}
}

type SubscriptionDTO struct {
	Status             string     `json:"status"`
	StatusLabel        string     `json:"status_label"`
	Summary            string     `json:"summary"`
	PriceCents         int64      `json:"price_cents"`
	CurrentPeriodEnd   time.Time  `json:"current_period_end"`
	GraceUntil         *time.Time `json:"grace_until"`
	DaysRemaining      int64      `json:"days_remaining"`
	GraceDaysRemaining int64      `json:"grace_days_remaining"`
	WriteLocked        bool       `json:"write_locked"`
}

func SubscriptionView(s store.Subscription) SubscriptionDTO {
	status := EffectiveStatus(s, time.Now())
	return SubscriptionDTO{
		Status: status.key(), StatusLabel: status.Label(), Summary: Summary(s), PriceCents: s.PriceCents,
		CurrentPeriodEnd: s.CurrentPeriodEnd, GraceUntil: s.GraceUntil, DaysRemaining: DaysRemaining(s),
		GraceDaysRemaining: GraceDaysRemaining(s), WriteLocked: status == Disabled,
	}
}

func SubscriptionFor(ctx context.Context, q *store.Queries, shopID int64) (*store.Subscription, error) {
	sub, err := q.SubscriptionForShop(ctx, shopID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &sub, err
}

// ExtendPeriod is BR-43: extend from the later of now or the existing period
// end, so cover is never lost and never double-applied.
func ExtendPeriod(ctx context.Context, q *store.Queries, s store.Subscription, months int32, by *int64) (time.Time, error) {
	base := s.CurrentPeriodEnd
	if now := time.Now().UTC(); now.After(base) {
		base = now
	}
	newEnd := base.AddDate(0, int(months), 0)
	err := q.ExtendSubscription(ctx, store.ExtendSubscriptionParams{
		ID: s.ID, CurrentPeriodEnd: newEnd, GraceUntil: util.Ptr(newEnd.AddDate(0, 0, GraceDays)),
	})
	if err != nil {
		return newEnd, err
	}
	return newEnd, Audit(ctx, q, "Subscription", s.ID, "period_extended", by,
		map[string]any{"months": months, "current_period_end": newEnd})
}

// RefreshStatus keeps the cached column honest; called from the enforcement path.
func RefreshStatus(ctx context.Context, q *store.Queries, s store.Subscription) error {
	derived := EffectiveStatus(s, time.Now())
	if s.Status == int32(derived) {
		return nil
	}
	var disabledAt *time.Time
	if derived == Disabled {
		disabledAt = s.DisabledAt
		if disabledAt == nil {
			disabledAt = util.Ptr(time.Now().UTC())
		}
	}
	return q.SetSubscriptionStatus(ctx, store.SetSubscriptionStatusParams{ID: s.ID, Status: int32(derived), DisabledAt: disabledAt})
}
