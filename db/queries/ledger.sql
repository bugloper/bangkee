-- name: TransactionByID :one
SELECT sqlc.embed(t), u.name AS created_by_name
FROM transactions t JOIN users u ON u.id = t.created_by_id
WHERE t.id = $1;

-- name: TransactionForOwner :one
SELECT sqlc.embed(t), u.name AS created_by_name
FROM transactions t
JOIN users u ON u.id = t.created_by_id
JOIN accounts a ON a.id = t.account_id
JOIN shops s ON s.id = a.shop_id
WHERE t.id = $1 AND s.owner_id = $2;

-- name: TransactionByIdempotencyKey :one
SELECT sqlc.embed(t), u.name AS created_by_name
FROM transactions t JOIN users u ON u.id = t.created_by_id
WHERE t.idempotency_key = $1;

-- name: AccountLedger :many
-- BR-10: chronological; `include_voided` keeps voided rows on the list.
SELECT sqlc.embed(t), u.name AS created_by_name
FROM transactions t JOIN users u ON u.id = t.created_by_id
WHERE t.account_id = $1 AND (sqlc.arg(include_voided)::boolean OR t.voided_at IS NULL)
ORDER BY t.occurred_at, t.id;

-- name: RecentShopTransactions :many
SELECT sqlc.embed(t), u.name AS created_by_name
FROM transactions t JOIN accounts a ON a.id = t.account_id JOIN users u ON u.id = t.created_by_id
WHERE a.shop_id = $1 AND t.voided_at IS NULL
ORDER BY t.occurred_at DESC, t.id DESC LIMIT 6;

-- name: RecentAccountsTransactions :many
SELECT sqlc.embed(t), u.name AS created_by_name
FROM transactions t JOIN users u ON u.id = t.created_by_id
WHERE t.account_id = ANY(sqlc.arg(account_ids)::bigint[]) AND t.voided_at IS NULL
ORDER BY t.occurred_at DESC, t.id DESC LIMIT 6;

-- name: RepaidSince :one
SELECT COALESCE(SUM(t.amount_cents), 0)::bigint
FROM transactions t JOIN accounts a ON a.id = t.account_id
WHERE a.shop_id = $1 AND t.kind = 1 AND t.voided_at IS NULL AND t.occurred_at >= sqlc.arg(since)::timestamptz;

-- name: SpentSince :one
SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM transactions
WHERE account_id = ANY(sqlc.arg(account_ids)::bigint[]) AND kind = 0 AND voided_at IS NULL
  AND occurred_at >= sqlc.arg(since)::timestamptz;

-- name: LineItemsFor :many
SELECT * FROM line_items
WHERE transaction_id = ANY(sqlc.arg(ids)::bigint[]) ORDER BY id;

-- name: LineItemsTotal :one
SELECT COALESCE(SUM(ROUND(quantity * unit_price_cents)), 0)::bigint FROM line_items WHERE transaction_id = $1;

-- name: InsertTransaction :one
-- An offline replay that loses the race to its twin inserts nothing.
INSERT INTO transactions (account_id, created_by_id, kind, amount_cents, description, notes, payment_method,
                          itemized, occurred_at, idempotency_key)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE(sqlc.narg(occurred_at)::timestamptz, now()), $9)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;

-- name: InsertLineItem :exec
INSERT INTO line_items (transaction_id, name, quantity, unit_price_cents) VALUES ($1, $2, $3, $4);

-- name: UpdateTransaction :exec
UPDATE transactions SET amount_cents = $2, description = $3, notes = $4, payment_method = $5,
       occurred_at = $6, updated_at = now()
WHERE id = $1;

-- name: VoidTransaction :execrows
UPDATE transactions SET voided_at = now(), voided_by_id = $2, updated_at = now()
WHERE id = $1 AND voided_at IS NULL;

-- name: TransactionVisibleTo :one
-- The shop's owner and the account's customer.
SELECT EXISTS(
  SELECT 1 FROM transactions t JOIN accounts a ON a.id = t.account_id JOIN shops s ON s.id = a.shop_id
  WHERE t.id = $1 AND (s.owner_id = sqlc.arg(user_id) OR a.customer_id = sqlc.arg(user_id))
);
