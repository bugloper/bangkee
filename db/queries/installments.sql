-- name: CreateInstallmentPlan :one
INSERT INTO installment_plans (account_id, created_by_id, total_cents, installment_count, frequency, first_due_on, notes)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: AccountInstallmentPlans :many
-- An account's plans, newest first, each with what has been paid towards
-- it: every payment on the account, not crossed out, since it started.
SELECT sqlc.embed(p), u.name AS created_by_name,
       COALESCE((SELECT SUM(t.amount_cents) FROM transactions t
                 WHERE t.account_id = p.account_id AND t.kind = 1 AND t.crossed_out_at IS NULL AND t.occurred_at >= p.starts_at), 0)::bigint AS paid_cents
FROM installment_plans p JOIN users u ON u.id = p.created_by_id
WHERE p.account_id = $1 ORDER BY p.created_at DESC, p.id DESC LIMIT 10;

-- name: ActiveInstallmentPlans :many
-- Every running plan in a shop with what has been paid towards it, for the dashboard.
SELECT sqlc.embed(p), a.customer_name,
       COALESCE((SELECT SUM(t.amount_cents) FROM transactions t
                 WHERE t.account_id = p.account_id AND t.kind = 1 AND t.crossed_out_at IS NULL AND t.occurred_at >= p.starts_at), 0)::bigint AS paid_cents
FROM installment_plans p JOIN accounts a ON a.id = p.account_id
WHERE a.shop_id = $1 AND p.status = 'active' ORDER BY p.first_due_on, p.id;

-- name: InstallmentPlanByID :one
SELECT * FROM installment_plans WHERE id = $1;

-- name: EndInstallmentPlan :execrows
UPDATE installment_plans SET status = sqlc.arg(status), ended_at = now(), updated_at = now()
WHERE id = sqlc.arg(id) AND status = 'active';

-- name: DeleteAccountInstallmentPlans :exec
DELETE FROM installment_plans WHERE account_id = $1;
