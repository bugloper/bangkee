-- name: MenuItemsOrdered :many
SELECT * FROM menu_items WHERE shop_id = $1 AND (available OR NOT sqlc.arg(available_only)::boolean)
ORDER BY position, name;

-- name: MenuItemInShop :one
SELECT * FROM menu_items WHERE shop_id = $1 AND id = $2;

-- name: MenuItemNameTaken :one
SELECT EXISTS(
  SELECT 1 FROM menu_items WHERE shop_id = $1 AND lower(name) = lower(sqlc.arg(name))
    AND (sqlc.narg(except_id)::bigint IS NULL OR id <> sqlc.narg(except_id))
);

-- name: CreateMenuItem :one
INSERT INTO menu_items (shop_id, name, category, price_cents, available, position) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;

-- name: UpdateMenuItem :exec
UPDATE menu_items SET name = $2, category = $3, price_cents = $4, available = $5, position = $6, updated_at = now()
WHERE id = $1;

-- name: DeleteMenuItem :exec
DELETE FROM menu_items WHERE id = $1;

-- name: NextMenuPosition :one
-- Where a new item goes: after everything already listed.
SELECT (COALESCE(MAX(position), -1) + 1)::integer FROM menu_items WHERE shop_id = $1;
