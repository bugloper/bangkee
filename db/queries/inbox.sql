-- Notifications, Web Push devices and uploaded files.

-- name: CreateNotification :one
INSERT INTO notifications (user_id, kind, title, body, path) VALUES ($1, $2, $3, $4, $5) RETURNING id;

-- name: NotificationByID :one
SELECT * FROM notifications WHERE id = $1;

-- name: RecentNotifications :many
SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50;

-- name: ReadNotification :one
UPDATE notifications SET read_at = COALESCE(read_at, now()), updated_at = now()
WHERE id = $1 AND user_id = $2 RETURNING path;

-- name: ReadAllNotifications :exec
UPDATE notifications SET read_at = now(), updated_at = now() WHERE user_id = $1 AND read_at IS NULL;

-- name: NotificationRecipientEmail :one
SELECT email_address FROM users WHERE id = $1;

-- name: UpsertPushSubscription :exec
-- A device that signs in as someone else now belongs to them.
INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, user_agent, last_used_at)
VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh_key = $3, auth_key = $4, user_agent = $5,
                                     last_used_at = now(), updated_at = now();

-- name: DeletePushSubscription :exec
DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2;

-- name: DeletePushSubscriptionByID :exec
DELETE FROM push_subscriptions WHERE id = $1;

-- name: PushSubscriptionsFor :many
SELECT * FROM push_subscriptions WHERE user_id = $1;

-- name: CreateBlob :one
INSERT INTO active_storage_blobs (key, filename, content_type, metadata, service_name, byte_size, checksum)
VALUES ($1, $2, $3, '{"identified":true}', $4, $5, $6) RETURNING id;

-- name: Attach :one
INSERT INTO active_storage_attachments (name, record_type, record_id, blob_id) VALUES ($1, $2, $3, $4) RETURNING id;

-- name: AttachmentIDs :many
SELECT id, record_id FROM active_storage_attachments
WHERE record_type = $1 AND record_id = ANY(sqlc.arg(record_ids)::bigint[]) AND name = $2
ORDER BY id;

-- name: AttachmentWithBlob :one
SELECT a.record_type, a.record_id, b.key, b.content_type
FROM active_storage_attachments a JOIN active_storage_blobs b ON b.id = a.blob_id WHERE a.id = $1;

-- name: DetachAll :exec
DELETE FROM active_storage_attachments WHERE record_type = $1 AND record_id = ANY(sqlc.arg(record_ids)::bigint[]);

-- name: AttachedBlobs :many
-- The files behind records' attachments, about to be let go.
SELECT b.id, b.key FROM active_storage_attachments a JOIN active_storage_blobs b ON b.id = a.blob_id
WHERE a.record_type = $1 AND a.record_id = ANY(sqlc.arg(record_ids)::bigint[]) AND a.name = $2;

-- name: DeleteBlobs :exec
DELETE FROM active_storage_blobs WHERE id = ANY(sqlc.arg(ids)::bigint[]);
