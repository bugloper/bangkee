package domain

import (
	"testing"
	"time"

	"bangkee/internal/store"
)

func TestStatusIsDerivedFromServerTime(t *testing.T) {
	now := time.Now()
	day := 24 * time.Hour
	sub := func(status SubStatus, end time.Time, grace time.Time) store.Subscription {
		return store.Subscription{Status: int32(status), CurrentPeriodEnd: end, GraceUntil: &grace, PriceCents: 20_000}
	}

	trial := sub(Trialing, now.Add(3*day), now.Add(17*day))
	if EffectiveStatus(trial, now) != Trialing || DaysRemaining(trial) != 3 {
		t.Errorf("trial: %v, %d days", EffectiveStatus(trial, now), DaysRemaining(trial))
	}

	lapsed := sub(Active, now.Add(-day), now.Add(13*day))
	if EffectiveStatus(lapsed, now) != PastDue || WriteLocked(lapsed) {
		t.Errorf("lapsed: %v", EffectiveStatus(lapsed, now))
	}

	// The stored column says active; the clock says otherwise.
	over := sub(Active, now.Add(-30*day), now.Add(-16*day))
	if EffectiveStatus(over, now) != Disabled || !WriteLocked(over) || Summary(over) != "Write actions are locked" {
		t.Errorf("over: %v, %q", EffectiveStatus(over, now), Summary(over))
	}
}
