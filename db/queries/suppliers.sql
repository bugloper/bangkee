-- name: SuppliersByName :many
SELECT * FROM suppliers WHERE shop_id = $1 ORDER BY lower(name), id;

-- name: SupplierInShop :one
SELECT * FROM suppliers WHERE id = $1 AND shop_id = $2;

-- name: SupplierNameTaken :one
SELECT EXISTS(SELECT 1 FROM suppliers WHERE shop_id = $1 AND lower(name) = lower(sqlc.arg(name)) AND (sqlc.narg(except_id)::bigint IS NULL OR id <> sqlc.narg(except_id)));

-- name: CreateSupplier :one
INSERT INTO suppliers (shop_id, name, phone, notes) VALUES ($1, $2, $3, $4) RETURNING *;

-- name: UpdateSupplier :exec
UPDATE suppliers SET name = $3, phone = $4, notes = $5, updated_at = now() WHERE id = $1 AND shop_id = $2;

-- name: DeleteSupplier :exec
DELETE FROM suppliers WHERE id = $1;

-- name: DeleteSupplierEntries :exec
DELETE FROM supplier_entries WHERE supplier_id = $1;

-- name: InsertSupplierEntry :one
INSERT INTO supplier_entries (supplier_id, created_by_id, kind, amount_cents, description, notes, payment_method, idempotency_key, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;

-- name: SupplierEntryByKey :one
SELECT * FROM supplier_entries WHERE idempotency_key = $1;

-- name: RecomputeSupplierBalance :exec
UPDATE suppliers SET
  balance_cents = COALESCE((SELECT SUM(CASE e.kind WHEN 0 THEN e.amount_cents ELSE -e.amount_cents END)
                            FROM supplier_entries e WHERE e.supplier_id = $1 AND e.crossed_out_at IS NULL), 0),
  last_activity_at = (SELECT MAX(e.occurred_at) FROM supplier_entries e WHERE e.supplier_id = $1 AND e.crossed_out_at IS NULL),
  updated_at = now()
WHERE suppliers.id = $1;

-- name: SupplierLedger :many
SELECT sqlc.embed(e), u.name AS created_by_name
FROM supplier_entries e JOIN users u ON u.id = e.created_by_id
WHERE e.supplier_id = $1 AND (sqlc.arg(include_crossed_out)::boolean OR e.crossed_out_at IS NULL)
ORDER BY e.occurred_at, e.id;

-- name: SupplierEntryInShop :one
SELECT e.* FROM supplier_entries e JOIN suppliers s ON s.id = e.supplier_id WHERE e.id = $1 AND s.shop_id = $2;

-- name: CrossOutSupplierEntry :execrows
UPDATE supplier_entries SET crossed_out_at = now(), crossed_out_by_id = $2, updated_at = now() WHERE id = $1 AND crossed_out_at IS NULL;

-- name: TotalPayable :one
SELECT COALESCE(SUM(balance_cents) FILTER (WHERE balance_cents > 0), 0)::bigint FROM suppliers WHERE shop_id = $1;
