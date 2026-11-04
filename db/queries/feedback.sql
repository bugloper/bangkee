-- Feedback, feature requests and support requests, and the operator's answers.

-- name: CreateFeedback :one
INSERT INTO feedback (user_id, kind, body) VALUES ($1, $2, $3) RETURNING id;

-- name: FeedbackForUser :many
-- Someone's own messages, newest first.
SELECT * FROM feedback WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50;

-- name: FeedbackList :many
-- The operator's queue: who sent it, their shop if they own one, who answered.
SELECT sqlc.embed(f), u.name AS user_name, u.email_address AS user_email, u.phone AS user_phone, u.role AS user_role,
       COALESCE((SELECT s.name FROM shops s WHERE s.owner_id = u.id ORDER BY s.id LIMIT 1), '')::varchar AS shop_name,
       r.name AS reviewed_by_name
FROM feedback f
JOIN users u ON u.id = f.user_id
LEFT JOIN users r ON r.id = f.reviewed_by_id
WHERE (sqlc.narg(status)::int IS NULL OR f.status = sqlc.narg(status))
ORDER BY f.created_at DESC, f.id DESC
LIMIT 500;

-- name: NewFeedbackCount :one
SELECT COUNT(*) FROM feedback WHERE status = 0;

-- name: LockFeedback :one
SELECT * FROM feedback WHERE id = $1 FOR UPDATE;

-- name: AcknowledgeFeedback :exec
UPDATE feedback SET status = 1, reviewed_by_id = $2, acknowledged_at = now(), updated_at = now() WHERE id = $1;

-- name: ReplyToFeedback :exec
-- A reply is also an acknowledgement, if there was none yet.
UPDATE feedback SET status = 2, reply = $3, reviewed_by_id = $2, replied_at = now(),
       acknowledged_at = COALESCE(acknowledged_at, now()), updated_at = now()
WHERE id = $1;
