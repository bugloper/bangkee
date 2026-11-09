-- name: SetConfirmation :execrows
-- Moves an entry from one confirmation state to another, only if it is still
-- in the state the caller saw: two taps racing each other change it once.
UPDATE transactions SET confirmation = sqlc.arg(confirmation), updated_at = now()
WHERE id = sqlc.arg(id) AND confirmation = ANY(sqlc.arg(from_states)::integer[]) AND crossed_out_at IS NULL;

-- name: ConfirmAllPending :many
-- The customer confirms everything still waiting on their account.
UPDATE transactions SET confirmation = 1, updated_at = now()
WHERE account_id = $1 AND confirmation = 0 AND crossed_out_at IS NULL
RETURNING id;

-- name: AddTransactionResponse :exec
INSERT INTO transaction_responses (transaction_id, user_id, action, note) VALUES ($1, $2, $3, $4);

-- name: AddTransactionResponses :exec
INSERT INTO transaction_responses (transaction_id, user_id, action)
SELECT unnest(sqlc.arg(ids)::bigint[]), sqlc.arg(user_id), sqlc.arg(action);

-- name: TransactionResponsesFor :many
SELECT r.*, u.name AS user_name FROM transaction_responses r JOIN users u ON u.id = r.user_id
WHERE r.transaction_id = ANY(sqlc.arg(ids)::bigint[]) ORDER BY r.created_at, r.id;

-- name: DeleteTransactionResponses :exec
DELETE FROM transaction_responses WHERE transaction_id = ANY(sqlc.arg(ids)::bigint[]);

-- name: DisputedEntries :many
-- Every entry a customer has flagged and the shop has not settled, oldest first.
SELECT sqlc.embed(t), u.name AS created_by_name, a.customer_name AS account_name
FROM transactions t JOIN accounts a ON a.id = t.account_id JOIN users u ON u.id = t.created_by_id
WHERE a.shop_id = $1 AND t.confirmation = 2 AND t.crossed_out_at IS NULL
ORDER BY t.updated_at, t.id;

-- name: AccountConfirmationCounts :one
SELECT COUNT(*) FILTER (WHERE confirmation = 0)::bigint AS pending,
       COUNT(*) FILTER (WHERE confirmation = 2)::bigint AS disputed
FROM transactions WHERE account_id = $1 AND crossed_out_at IS NULL;
