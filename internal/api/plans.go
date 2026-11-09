package api

import (
	"context"
	"strings"
	"time"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
)

// planAllows reads the shop's subscription and says whether its plan
// includes the feature.
func (s *Server) planAllows(ctx context.Context, q *store.Queries, shopID int64, f domain.Feature) (bool, error) {
	sub, err := domain.SubscriptionFor(ctx, q, shopID)
	if err != nil {
		return false, err
	}
	return domain.PlanAllows(sub, f, time.Now()), nil
}

// requireFeature refuses, naming the plan that has it, when the shop's plan
// does not include the feature.
func (s *Server) requireFeature(ctx context.Context, shopID int64, f domain.Feature) error {
	allowed, err := s.planAllows(ctx, s.Q, shopID, f)
	if err != nil || allowed {
		return err
	}
	plan := domain.CheapestPlanWith(f)
	return apperr.NewPlanRequired("Your plan does not include this: "+strings.ToLower(domain.FeatureNames[f])+". It comes with "+plan.Name+" — change plans in Billing.", string(f))
}
