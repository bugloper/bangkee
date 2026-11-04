-- name: ShopByID :one
SELECT * FROM shops WHERE id = $1;

-- name: ShopForOwner :one
SELECT * FROM shops WHERE owner_id = $1 ORDER BY id LIMIT 1;

-- name: AllShops :many
SELECT * FROM shops ORDER BY id;

-- name: CreateShop :one
INSERT INTO shops (owner_id, name) VALUES ($1, $2) RETURNING id;

-- name: OverdueAccounts :many
SELECT * FROM accounts
WHERE shop_id = $1 AND balance_cents > 0
  AND (last_activity_at IS NULL OR last_activity_at < sqlc.arg(threshold)::timestamptz)
ORDER BY balance_cents DESC, id;

-- name: TotalOutstanding :one
SELECT COALESCE(SUM(balance_cents), 0)::bigint FROM accounts WHERE shop_id = $1 AND balance_cents > 0;

-- name: ShopCounts :one
SELECT (SELECT COUNT(*) FROM menu_items m WHERE m.shop_id = $1)::bigint AS menu_items,
       (SELECT COUNT(*) FROM bank_accounts b WHERE b.shop_id = $1)::bigint AS bank_accounts,
       (SELECT COUNT(*) FROM accounts a WHERE a.shop_id = $1)::bigint AS customers;

-- name: SubscriptionForShop :one
SELECT * FROM subscriptions WHERE shop_id = $1;

-- name: ProvisionSubscription :exec
INSERT INTO subscriptions (shop_id, status, current_period_end, grace_until, price_cents) VALUES ($1, 0, $2, $3, $4);

-- name: ExtendSubscription :exec
UPDATE subscriptions SET status = 1, current_period_end = $2, grace_until = $3, disabled_at = NULL, updated_at = now()
WHERE id = $1;

-- name: SetSubscriptionStatus :exec
UPDATE subscriptions SET status = $2, disabled_at = $3, updated_at = now() WHERE id = $1;

-- name: AdminStats :one
SELECT (SELECT COUNT(*) FROM shops)::bigint AS shops,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM subscription_payments
        WHERE status = 1 AND reviewed_at >= sqlc.arg(month_start)::timestamptz)::bigint AS approved,
       (SELECT COUNT(*) FROM subscriptions
        WHERE now() > current_period_end AND (grace_until IS NULL OR now() > grace_until))::bigint AS locked;

-- name: AdminShops :many
SELECT s.id, s.name, u.name AS owner_name, u.email_address AS owner_email
FROM shops s JOIN users u ON u.id = s.owner_id ORDER BY s.name, s.id;

-- name: SetShopKind :exec
UPDATE shops SET kind = $2, updated_at = now() WHERE id = $1;

-- name: ShopDirectory :many
-- Every shop with something to show a customer: at least one item available.
SELECT s.id, s.name, s.kind,
       (SELECT COUNT(*) FROM menu_items m WHERE m.shop_id = s.id AND m.available)::bigint AS items_count
FROM shops s
WHERE EXISTS (SELECT 1 FROM menu_items m WHERE m.shop_id = s.id AND m.available)
  AND (sqlc.narg(kind)::varchar IS NULL OR s.kind = sqlc.narg(kind))
  AND (sqlc.narg(search)::varchar IS NULL OR s.name ILIKE '%' || sqlc.narg(search) || '%')
ORDER BY s.name, s.id
LIMIT 200;
