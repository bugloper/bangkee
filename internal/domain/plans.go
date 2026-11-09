package domain

import (
	"time"

	"bangkee/internal/store"
)

// Plans. Every shop keeps a credit book on every plan — customers, credits
// and payments, statements, receipts, the customer's confirmations, the
// dashboard, reminding one customer at a time. The higher plans add what a
// busier shop needs. A free trial has everything, so a new shop sees it all
// before choosing.
//
// The plan is enforced on the server, from the subscription row, every time
// a feature is used; the client only hides buttons.

type Feature string

const (
	FeatureAutomaticReminders Feature = "automatic_reminders"
	FeatureBulkReminders      Feature = "bulk_reminders"
	FeatureAttachments        Feature = "attachments"
	FeatureInstallments       Feature = "installments"
	FeatureSuppliers          Feature = "suppliers"
	FeatureStaff              Feature = "staff"
)

type Plan struct {
	Key      string    `json:"key"`
	Name     string    `json:"name"`
	Summary  string    `json:"summary"`
	Features []Feature `json:"features"`
	// MaxStaff is how many people besides the owner can work in the shop.
	MaxStaff int `json:"max_staff"`
}

const (
	PlanBasic    = "basic"
	PlanPro      = "pro"
	PlanBusiness = "business"
)

var Plans = []Plan{
	{Key: PlanBasic, Name: "Basic", Summary: "The shared credit book: customers, credit and payments, statements, receipts and confirmations."},
	{Key: PlanPro, Name: "Pro", Summary: "Everything in Basic, and Bangkee chases what is owed: automatic reminders, plans to pay in installments, photos and documents on entries, and a book for your suppliers.",
		Features: []Feature{FeatureAutomaticReminders, FeatureBulkReminders, FeatureAttachments, FeatureInstallments, FeatureSuppliers}},
	{Key: PlanBusiness, Name: "Business", Summary: "Everything in Pro, for a shop with staff: up to 5 people record entries under their own names.",
		Features: []Feature{FeatureAutomaticReminders, FeatureBulkReminders, FeatureAttachments, FeatureInstallments, FeatureSuppliers, FeatureStaff}, MaxStaff: 5},
}

// FeatureNames are how a feature is named when a plan is needed for it.
var FeatureNames = map[Feature]string{
	FeatureAutomaticReminders: "Automatic reminders",
	FeatureBulkReminders:      "Reminding every overdue customer at once",
	FeatureAttachments:        "Photos and documents on entries",
	FeatureInstallments:       "Installment plans",
	FeatureSuppliers:          "The supplier book",
	FeatureStaff:              "Staff accounts",
}

func PlanByKey(key string) (Plan, bool) {
	for _, p := range Plans {
		if p.Key == key {
			return p, true
		}
	}
	return Plan{}, false
}

// CheapestPlanWith is the plan to suggest when a feature is not on the shop's.
func CheapestPlanWith(f Feature) Plan {
	for _, p := range Plans {
		if p.has(f) {
			return p
		}
	}
	return Plans[len(Plans)-1]
}

func (p Plan) has(f Feature) bool {
	for _, have := range p.Features {
		if have == f {
			return true
		}
	}
	return false
}

// PlanAllows says whether the shop may use a feature now. A trial has
// everything; so does a shop with no subscription row (there are none, but
// a missing row must never lock an owner out of their own book).
func PlanAllows(sub *store.Subscription, f Feature, now time.Time) bool {
	if sub == nil || EffectiveStatus(*sub, now) == Trialing {
		return true
	}
	plan, ok := PlanByKey(sub.Plan)
	return ok && plan.has(f)
}

// MaxStaffFor is how many staff the shop may have now.
func MaxStaffFor(sub *store.Subscription, now time.Time) int {
	if sub == nil || EffectiveStatus(*sub, now) == Trialing {
		return Plans[len(Plans)-1].MaxStaff
	}
	plan, _ := PlanByKey(sub.Plan)
	return plan.MaxStaff
}

func planName(key string) string {
	if plan, ok := PlanByKey(key); ok {
		return plan.Name
	}
	return key
}

// availableFeatures is every feature the shop may use now.
func availableFeatures(sub *store.Subscription) []Feature {
	out := []Feature{}
	for _, f := range Plans[len(Plans)-1].Features {
		if PlanAllows(sub, f, time.Now()) {
			out = append(out, f)
		}
	}
	return out
}
