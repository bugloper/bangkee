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

-- name: MenuItemForUpdate :one
-- An item locked while its count changes, so two changes at once both land.
SELECT * FROM menu_items WHERE shop_id = $1 AND id = $2 FOR UPDATE;

-- name: SetStockSettings :exec
-- Whether the item is counted and how: stock NULL stops counting it.
UPDATE menu_items SET stock = $2, low_stock_at = $3, cost_cents = $4, updated_at = now() WHERE id = $1;

-- name: SetItemCost :exec
UPDATE menu_items SET cost_cents = $2, updated_at = now() WHERE id = $1;

-- name: MoveStock :one
-- Changes a counted item's count. No row when the item is not counted.
UPDATE menu_items SET stock = stock + sqlc.arg(change)::integer, updated_at = now()
WHERE id = $1 AND stock IS NOT NULL
RETURNING id, name, stock::integer AS stock, low_stock_at;

-- name: InsertStockMovement :exec
INSERT INTO stock_movements (menu_item_id, change, stock_after, reason, unit_cost_cents, transaction_id, sale_id, notes, created_by_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: StockMovements :many
-- An item's history, newest first.
SELECT m.*, u.name AS by_name FROM stock_movements m JOIN users u ON u.id = m.created_by_id
WHERE m.menu_item_id = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT 100;

-- name: LowStockItems :many
-- Counted items at or under their warning level, or out.
SELECT * FROM menu_items
WHERE shop_id = $1 AND stock IS NOT NULL AND stock <= COALESCE(low_stock_at, 0)
ORDER BY stock, name;

-- name: StockTakenByEntry :many
-- What recording a credit took off each item's count, to put back when it is crossed out.
SELECT menu_item_id, (-SUM(change))::integer AS taken FROM stock_movements
WHERE transaction_id = $1 AND reason = 'credit' GROUP BY menu_item_id;

-- name: StockTakenBySale :many
-- What recording a sale took off each item's count, to put back when it is crossed out.
SELECT menu_item_id, (-SUM(change))::integer AS taken FROM stock_movements
WHERE sale_id = $1 AND reason = 'sale' GROUP BY menu_item_id;
