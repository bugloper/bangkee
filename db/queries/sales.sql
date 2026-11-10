-- name: InsertSale :one
-- A replay of a sale already recorded (the same idempotency key) inserts
-- nothing: the id is 0.
WITH row AS (
  INSERT INTO sales (shop_id, account_id, created_by_id, amount_cents, payment_method, description, itemized, occurred_at, idempotency_key)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id
)
SELECT COALESCE((SELECT id FROM row), 0)::bigint AS id;

-- name: InsertSaleItem :exec
INSERT INTO sale_items (sale_id, name, quantity, unit_price_cents, menu_item_id) VALUES ($1, $2, $3, $4, $5);

-- name: SaleInShop :one
SELECT * FROM sales WHERE id = $1 AND shop_id = $2;

-- name: CrossOutSale :execrows
UPDATE sales SET crossed_out_at = now(), crossed_out_by_id = $2 WHERE id = $1 AND crossed_out_at IS NULL;

-- name: SalesBetween :many
-- A shop's sales in [from, to), newest first, with who recorded each and the customer named on it.
SELECT sqlc.embed(s), u.name AS created_by_name, a.customer_name AS customer_name
FROM sales s
JOIN users u ON u.id = s.created_by_id
LEFT JOIN accounts a ON a.id = s.account_id
WHERE s.shop_id = $1 AND s.occurred_at >= sqlc.arg(from_time)::timestamptz AND s.occurred_at < sqlc.arg(to_time)::timestamptz
ORDER BY s.occurred_at DESC, s.id DESC
LIMIT 500;

-- name: SaleItemsFor :many
SELECT * FROM sale_items WHERE sale_id = ANY(sqlc.arg(sale_ids)::bigint[]) ORDER BY sale_id, id;

-- name: SalesByMethod :many
-- What a shop took in sales in [from, to) by how it was paid; crossed-out sales do not count.
SELECT payment_method, COALESCE(SUM(amount_cents), 0)::bigint AS cents, COUNT(*)::bigint AS sales
FROM sales
WHERE shop_id = $1 AND crossed_out_at IS NULL AND occurred_at >= sqlc.arg(from_time)::timestamptz AND occurred_at < sqlc.arg(to_time)::timestamptz
GROUP BY payment_method;

-- name: DailySales :many
-- Sales per day, days as Bhutan has them, from `since` on — the dashboard's trend.
SELECT to_char(occurred_at AT TIME ZONE 'Asia/Thimphu', 'YYYY-MM-DD')::varchar AS day, COALESCE(SUM(amount_cents), 0)::bigint AS cents
FROM sales
WHERE shop_id = $1 AND crossed_out_at IS NULL AND occurred_at >= sqlc.arg(since)::timestamptz
GROUP BY 1 ORDER BY 1;

-- name: MonthlySales :many
-- Sales per month, months as Bhutan has them, from `since` on — Insights.
SELECT to_char(occurred_at AT TIME ZONE 'Asia/Thimphu', 'YYYY-MM')::varchar AS month, COALESCE(SUM(amount_cents), 0)::bigint AS cents, COUNT(*)::bigint AS sales
FROM sales
WHERE shop_id = $1 AND crossed_out_at IS NULL AND occurred_at >= sqlc.arg(since)::timestamptz
GROUP BY 1 ORDER BY 1;

-- name: CollectedBetween :one
-- Payments received on credit in [from, to): the other half of a day's takings.
SELECT COALESCE(SUM(t.amount_cents), 0)::bigint
FROM transactions t JOIN accounts a ON a.id = t.account_id
WHERE a.shop_id = $1 AND t.kind = 1 AND t.crossed_out_at IS NULL
  AND t.occurred_at >= sqlc.arg(from_time)::timestamptz AND t.occurred_at < sqlc.arg(to_time)::timestamptz;
