package domain

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"bangkee/internal/apperr"
	"bangkee/internal/money"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Installment plans: the shop and a customer agree that what is owed is paid
// back in parts, on dates. The plan is only the agreement. Money still moves
// only as payments recorded in the book, and the plan's progress is read
// from them: every payment on the account since the plan began, oldest
// first, fills the installments in order. So a part-payment leaves an
// installment partly paid, paying ahead covers the next ones, and paying
// everything off ends the plan — with no second set of figures to drift
// from the balance.

var InstallmentFrequencies = []string{"weekly", "fortnightly", "monthly"}

const (
	MinInstallments = 2
	MaxInstallments = 24
)

type InstallmentDTO struct {
	Number      int       `json:"number"`
	DueOn       time.Time `json:"due_on"` // a Thimphu day, as midnight UTC
	AmountCents int64     `json:"amount_cents"`
	PaidCents   int64     `json:"paid_cents"`
	Status      string    `json:"status"` // paid | partial | overdue | due_today | upcoming
}

type InstallmentPlanDTO struct {
	ID               int64            `json:"id"`
	AccountID        int64            `json:"account_id"`
	TotalCents       int64            `json:"total_cents"`
	InstallmentCount int32            `json:"installment_count"`
	Frequency        string           `json:"frequency"`
	FirstDueOn       time.Time        `json:"first_due_on"`
	Notes            *string          `json:"notes"`
	Status           string           `json:"status"` // active | completed | cancelled
	CreatedAt        time.Time        `json:"created_at"`
	CreatedByName    string           `json:"created_by_name"`
	EndedAt          *time.Time       `json:"ended_at"`
	PaidCents        int64            `json:"paid_cents"`
	RemainingCents   int64            `json:"remaining_cents"`
	OverdueCount     int              `json:"overdue_count"`
	OverdueCents     int64            `json:"overdue_cents"`
	Next             *InstallmentDTO  `json:"next"` // the first not fully paid
	Installments     []InstallmentDTO `json:"installments"`
}

// dueDate is the n-th due date (0-based). Monthly plans keep the day of the
// month, or the month's last day when it is shorter (31 Jan, 28 Feb, 31 Mar).
func dueDate(first time.Time, frequency string, n int) time.Time {
	switch frequency {
	case "weekly":
		return first.AddDate(0, 0, 7*n)
	case "fortnightly":
		return first.AddDate(0, 0, 14*n)
	}
	year, month := first.Year(), int(first.Month())-1+n
	year, month = year+month/12, month%12+1
	last := time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
	return time.Date(year, time.Month(month), min(first.Day(), last), 0, 0, 0, 0, time.UTC)
}

// amounts splits the total into equal parts; the last takes the remainder.
func amounts(total int64, count int) []int64 {
	out := make([]int64, count)
	base := total / int64(count)
	for i := range out {
		out[i] = base
	}
	out[count-1] += total - base*int64(count)
	return out
}

// schedule lays the paid amount over the installments, as of `today` (a
// Thimphu day at midnight UTC).
func schedule(p store.InstallmentPlan, paid int64, today time.Time) InstallmentPlanDTO {
	view := InstallmentPlanDTO{
		ID: p.ID, AccountID: p.AccountID, TotalCents: p.TotalCents, InstallmentCount: p.InstallmentCount, Frequency: p.Frequency,
		FirstDueOn: p.FirstDueOn, Notes: p.Notes, Status: p.Status, CreatedAt: p.CreatedAt, EndedAt: p.EndedAt,
		PaidCents: min(paid, p.TotalCents),
	}
	view.RemainingCents = p.TotalCents - view.PaidCents
	left := view.PaidCents
	for i, amount := range amounts(p.TotalCents, int(p.InstallmentCount)) {
		in := InstallmentDTO{Number: i + 1, DueOn: dueDate(p.FirstDueOn, p.Frequency, i), AmountCents: amount, PaidCents: min(left, amount)}
		left -= in.PaidCents
		switch {
		case in.PaidCents == amount:
			in.Status = "paid"
		case in.DueOn.Before(today):
			in.Status = "overdue"
			view.OverdueCount++
			view.OverdueCents += amount - in.PaidCents
		case in.DueOn.Equal(today):
			in.Status = "due_today"
		case in.PaidCents > 0:
			in.Status = "partial"
		default:
			in.Status = "upcoming"
		}
		if in.Status != "paid" && view.Next == nil {
			next := in
			view.Next = &next
		}
		view.Installments = append(view.Installments, in)
	}
	if view.Status == "active" && view.RemainingCents == 0 {
		view.Status = "completed"
	}
	return view
}

// InstallmentPlans are the account's plans, newest first, each with its progress.
func InstallmentPlans(ctx context.Context, q *store.Queries, accountID int64, now time.Time) ([]InstallmentPlanDTO, error) {
	rows, err := q.AccountInstallmentPlans(ctx, accountID)
	if err != nil {
		return nil, err
	}
	out := make([]InstallmentPlanDTO, 0, len(rows))
	for _, row := range rows {
		view := schedule(row.InstallmentPlan, row.PaidCents, thimphuDay(now))
		view.CreatedByName = row.CreatedByName
		out = append(out, view)
	}
	return out, nil
}

type InstallmentPlanInput struct {
	Total      string `json:"total"`
	Count      int32  `json:"count"`
	Frequency  string `json:"frequency"`
	FirstDueOn string `json:"first_due_on"` // YYYY-MM-DD
	Notes      string `json:"notes"`
}

// CreateInstallmentPlan agrees a plan for part or all of what the account
// owes. A plan already running must be finished or cancelled first; one that
// has been paid in full is closed here.
func CreateInstallmentPlan(ctx context.Context, q *store.Queries, account store.Account, by int64, in InstallmentPlanInput, now time.Time) (store.InstallmentPlan, error) {
	var errs apperr.Errors
	total, ok := money.ParseCents(in.Total)
	errs.Check(ok && total > 0, "Amount must be greater than 0")
	errs.Check(!ok || total <= account.BalanceCents, "A plan can cover at most what the customer owes now")
	errs.Check(in.Count >= MinInstallments && in.Count <= MaxInstallments, "Choose between 2 and 24 installments")
	known := false
	for _, f := range InstallmentFrequencies {
		known = known || f == in.Frequency
	}
	errs.Check(known, "Choose weekly, fortnightly or monthly")
	first, err := time.Parse("2006-01-02", in.FirstDueOn)
	errs.Check(err == nil, "Choose the date of the first installment")
	errs.Check(err != nil || !first.Before(thimphuDay(now)), "The first installment cannot be due in the past")
	errs.Check(ok && total >= int64(max(in.Count, 1))*100, "Each installment must be at least Nu. 1")
	if account.BalanceCents <= 0 {
		return store.InstallmentPlan{}, apperr.NewRule("Nothing is owed, so there is nothing to pay in installments.")
	}
	if err := errs.Err(); err != nil {
		return store.InstallmentPlan{}, err
	}

	running, err := InstallmentPlans(ctx, q, account.ID, now)
	if err != nil {
		return store.InstallmentPlan{}, err
	}
	for _, p := range running {
		if p.Status == "completed" {
			if _, err := q.EndInstallmentPlan(ctx, store.EndInstallmentPlanParams{ID: p.ID, Status: "completed"}); err != nil {
				return store.InstallmentPlan{}, err
			}
		}
	}

	plan, err := q.CreateInstallmentPlan(ctx, store.CreateInstallmentPlanParams{
		AccountID: account.ID, CreatedByID: by, TotalCents: total, InstallmentCount: in.Count, Frequency: in.Frequency,
		FirstDueOn: first, Notes: util.Presence(in.Notes),
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return plan, apperr.NewRule("This customer already has a plan running. Cancel it first.")
	}
	if err != nil {
		return plan, err
	}
	return plan, Audit(ctx, q, "Account", account.ID, "installment_plan_created", &by,
		map[string]any{"plan_id": plan.ID, "total_cents": total, "installments": in.Count, "frequency": in.Frequency})
}

// CancelInstallmentPlan ends a running plan. What was paid stays paid; the
// balance is untouched.
func CancelInstallmentPlan(ctx context.Context, q *store.Queries, plan store.InstallmentPlan, by int64) error {
	ended, err := q.EndInstallmentPlan(ctx, store.EndInstallmentPlanParams{ID: plan.ID, Status: "cancelled"})
	if err != nil {
		return err
	}
	if ended == 0 {
		return apperr.NewRule("That plan has already ended.")
	}
	return Audit(ctx, q, "Account", plan.AccountID, "installment_plan_cancelled", &by, map[string]any{"plan_id": plan.ID})
}

func InstallmentPlanByID(ctx context.Context, q *store.Queries, id int64) (store.InstallmentPlan, error) {
	plan, err := q.InstallmentPlanByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return plan, apperr.ErrNotFound
	}
	return plan, err
}

// PlanDue is a running plan with an installment late, for the dashboard.
type PlanDue struct {
	InstallmentPlanDTO
	CustomerName string `json:"customer_name"`
}

// LateInstallmentPlans are the shop's running plans with an installment overdue.
func LateInstallmentPlans(ctx context.Context, q *store.Queries, shopID int64, now time.Time) ([]PlanDue, error) {
	rows, err := q.ActiveInstallmentPlans(ctx, shopID)
	if err != nil {
		return nil, err
	}
	out := []PlanDue{}
	for _, row := range rows {
		view := schedule(row.InstallmentPlan, row.PaidCents, thimphuDay(now))
		if view.Status == "active" && view.OverdueCount > 0 {
			out = append(out, PlanDue{InstallmentPlanDTO: view, CustomerName: row.CustomerName})
		}
	}
	return out, nil
}
