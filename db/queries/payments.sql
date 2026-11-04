-- The shop's bank details, and §17 billing payments.

-- name: BankAccountsForShop :many
SELECT * FROM bank_accounts WHERE shop_id = $1 AND (active OR NOT sqlc.arg(active_only)::boolean)
ORDER BY "primary" DESC, id;

-- name: BankAccountInShop :one
SELECT * FROM bank_accounts WHERE shop_id = $1 AND id = $2;

-- name: CreateBankAccount :one
INSERT INTO bank_accounts (shop_id, bank_name, account_name, account_number, branch, mobile_wallet, instructions, "primary", active)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id;

-- name: UpdateBankAccount :exec
UPDATE bank_accounts SET bank_name = $3, account_name = $4, account_number = $5, branch = $6, mobile_wallet = $7,
       instructions = $8, "primary" = $9, active = $10, updated_at = now()
WHERE shop_id = $1 AND id = $2;

-- name: DemoteOtherPrimaries :exec
-- BR-27: at most one primary per shop.
UPDATE bank_accounts SET "primary" = false WHERE shop_id = $1 AND id <> $2 AND "primary";

-- name: DeleteBankAccount :exec
DELETE FROM bank_accounts WHERE shop_id = $1 AND id = $2;

-- name: SubscriptionPaymentList :many
-- `oldest_first` for the operator's queue; newest first everywhere else.
SELECT sqlc.embed(p), r.name AS reviewed_by_name, u.name AS submitted_by_name, s.name AS shop_name
FROM subscription_payments p
JOIN shops s ON s.id = p.shop_id
JOIN users u ON u.id = p.submitted_by_id
LEFT JOIN users r ON r.id = p.reviewed_by_id
WHERE (sqlc.narg(shop_id)::bigint IS NULL OR p.shop_id = sqlc.narg(shop_id))
  AND (sqlc.narg(status)::int IS NULL OR p.status = sqlc.narg(status))
ORDER BY CASE WHEN sqlc.arg(oldest_first)::boolean THEN p.created_at END ASC, p.created_at DESC, p.id DESC
LIMIT sqlc.arg(row_limit);

-- name: PendingSubscriptionPaymentCount :one
SELECT COUNT(*) FROM subscription_payments WHERE status = 0;

-- name: LockSubscriptionPayment :one
SELECT sqlc.embed(p), s.name AS shop_name
FROM subscription_payments p JOIN shops s ON s.id = p.shop_id
WHERE p.id = $1 FOR UPDATE OF p;

-- name: CreateSubscriptionPayment :one
INSERT INTO subscription_payments (shop_id, submitted_by_id, amount_cents, months, method, reference)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;

-- name: ApproveSubscriptionPayment :exec
UPDATE subscription_payments SET status = 1, reviewed_by_id = $2, reviewed_at = now(), updated_at = now() WHERE id = $1;

-- name: RejectSubscriptionPayment :exec
UPDATE subscription_payments SET status = 2, reviewed_by_id = $2, reviewed_at = now(), rejection_reason = $3, updated_at = now()
WHERE id = $1;

-- name: SubscriptionPaymentOwnedBy :one
SELECT EXISTS(
  SELECT 1 FROM subscription_payments p JOIN shops s ON s.id = p.shop_id WHERE p.id = $1 AND s.owner_id = $2
);
