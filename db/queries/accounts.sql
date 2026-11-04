-- name: AccountByID :one
SELECT * FROM accounts WHERE id = $1;

-- name: AccountInShop :one
SELECT * FROM accounts WHERE id = $1 AND shop_id = $2;

-- name: AccountByInviteToken :one
SELECT * FROM accounts WHERE invite_token = $1;

-- name: AccountsByName :many
SELECT * FROM accounts WHERE shop_id = $1 ORDER BY customer_name, id;

-- name: SearchAccounts :many
SELECT * FROM accounts WHERE shop_id = $1 AND (customer_name ILIKE sqlc.arg(pattern) OR customer_phone ILIKE sqlc.arg(pattern))
ORDER BY customer_name, id;

-- name: CustomerAccounts :many
SELECT sqlc.embed(a), s.name AS shop_name, s.credit_due_days
FROM accounts a JOIN shops s ON s.id = a.shop_id
WHERE a.customer_id = $1 ORDER BY a.balance_cents DESC, a.id;

-- name: AccountNames :many
SELECT id, customer_name FROM accounts WHERE id = ANY(sqlc.arg(ids)::bigint[]);

-- name: CreateAccount :one
INSERT INTO accounts (shop_id, customer_name, customer_phone, invite_token) VALUES ($1, $2, $3, $4) RETURNING id;

-- name: UpdateAccount :exec
UPDATE accounts SET customer_name = $2, customer_phone = $3, updated_at = now() WHERE id = $1;

-- name: RecomputeBalance :exec
-- BR-6/BR-7: cached on the row so lists don't aggregate per customer.
UPDATE accounts SET
  balance_cents = COALESCE((SELECT SUM(CASE t.kind WHEN 0 THEN t.amount_cents ELSE -t.amount_cents END)
                            FROM transactions t WHERE t.account_id = $1 AND t.crossed_out_at IS NULL), 0),
  last_activity_at = (SELECT MAX(t.occurred_at) FROM transactions t WHERE t.account_id = $1 AND t.crossed_out_at IS NULL),
  updated_at = now()
WHERE accounts.id = $1;

-- name: ClaimAccount :execrows
UPDATE accounts SET customer_id = $2, customer_phone = $3, updated_at = now()
WHERE id = $1 AND customer_id IS NULL;

-- name: AccountTransactionIDs :many
SELECT id FROM transactions WHERE account_id = $1;

-- name: DeleteLineItemsOf :exec
DELETE FROM line_items WHERE transaction_id = ANY(sqlc.arg(ids)::bigint[]);

-- name: DeleteAccountTransactions :exec
DELETE FROM transactions WHERE account_id = $1;

-- name: DeleteAccount :exec
DELETE FROM accounts WHERE id = $1;

-- name: CreateAuditEvent :exec
INSERT INTO audit_events (auditable_type, auditable_id, action, actor_id, metadata) VALUES ($1, $2, $3, $4, $5);

-- name: RecentAuditEvents :many
SELECT e.id, e.action, e.created_at, e.metadata, u.name AS actor_name
FROM audit_events e LEFT JOIN users u ON u.id = e.actor_id
WHERE e.auditable_type = $1 AND e.auditable_id = $2
ORDER BY e.created_at DESC, e.id DESC LIMIT $3;

-- name: DeleteAuditEvents :exec
DELETE FROM audit_events WHERE auditable_type = $1 AND auditable_id = ANY(sqlc.arg(ids)::bigint[]);

-- name: CustomerAccountInShop :one
-- A signed-in customer's page at a shop; the oldest when they have two.
SELECT id FROM accounts WHERE shop_id = $1 AND customer_id = $2 ORDER BY id LIMIT 1;

-- name: AccountPhoneTaken :one
SELECT EXISTS(
  SELECT 1 FROM accounts WHERE shop_id = sqlc.arg(shop_id) AND bangkee_phone(customer_phone) = sqlc.arg(phone)::text
    AND (sqlc.narg(except_id)::bigint IS NULL OR id <> sqlc.narg(except_id))
);

-- name: StartPinReset :exec
-- A fresh link (the old one stops working) that can set a new PIN until $3.
UPDATE accounts SET invite_token = $2, pin_reset_until = $3, updated_at = now() WHERE id = $1;

-- name: EndPinReset :exec
UPDATE accounts SET pin_reset_until = NULL, updated_at = now() WHERE id = $1;

-- name: OwingAccounts :many
-- Everyone who owes the shop something, most first.
SELECT * FROM accounts WHERE shop_id = $1 AND balance_cents > 0 ORDER BY balance_cents DESC, id;
