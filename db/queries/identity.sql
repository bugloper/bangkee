-- name: UserByID :one
SELECT * FROM users WHERE id = $1;

-- name: UserByEmail :one
SELECT * FROM users WHERE email_address = $1;

-- name: CreateUser :one
INSERT INTO users (name, email_address, phone, password_digest, role)
VALUES ($1, $2, $3, $4, $5) RETURNING id;

-- name: SetPasswordDigest :exec
UPDATE users SET password_digest = $2, updated_at = now() WHERE id = $1;

-- name: SetLocale :exec
UPDATE users SET locale = $2, updated_at = now() WHERE id = $1;

-- name: MakePlatformAdmin :exec
UPDATE users SET platform_admin = true WHERE id = $1;

-- name: PlatformAdminIDs :many
SELECT id FROM users WHERE platform_admin ORDER BY id;

-- name: CreateSession :exec
INSERT INTO sessions (user_id, token, ip_address, user_agent) VALUES ($1, $2, $3, $4);

-- name: SessionUser :one
SELECT s.id AS session_id, sqlc.embed(u)
FROM sessions s JOIN users u ON u.id = s.user_id
WHERE s.token = $1;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE id = $1;

-- name: DeleteUserSessions :exec
DELETE FROM sessions WHERE user_id = $1;

-- name: UnreadCount :one
SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL;

-- name: PushDeviceCount :one
SELECT COUNT(*) FROM push_subscriptions WHERE user_id = $1;

-- name: CustomerByPhone :one
-- The customer who signs in with this phone, phone as bangkee_phone() gives it.
SELECT * FROM users WHERE role = 1 AND bangkee_phone(phone) = sqlc.arg(phone)::text
ORDER BY (email_address IS NULL) DESC, id LIMIT 1;

-- name: CreatePinCustomer :one
INSERT INTO users (name, email_address, phone, password_digest, role)
VALUES ($1, NULL, $2, $3, 1) RETURNING id;
