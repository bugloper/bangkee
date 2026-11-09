-- Testimonials: what people say about Bangkee, approved for the homepage.

-- name: TestimonialForUser :one
SELECT * FROM testimonials WHERE user_id = $1;

-- name: SaveTestimonial :one
-- Written or rewritten: either way it waits for review again.
INSERT INTO testimonials (user_id, body) VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET body = EXCLUDED.body, status = 0, reviewed_by_id = NULL, reviewed_at = NULL, updated_at = now()
RETURNING id;

-- name: DeleteTestimonial :execrows
DELETE FROM testimonials WHERE user_id = $1;

-- name: ApprovedTestimonials :many
-- The homepage's: who said it and, for an owner, their shop. Newest approval first.
SELECT t.id, t.body, u.name AS user_name, u.role AS user_role,
       COALESCE((SELECT s.name FROM shops s WHERE s.owner_id = u.id ORDER BY s.id LIMIT 1), '')::varchar AS shop_name,
       COALESCE((SELECT s.location FROM shops s WHERE s.owner_id = u.id ORDER BY s.id LIMIT 1), '')::varchar AS shop_location
FROM testimonials t
JOIN users u ON u.id = t.user_id
WHERE t.status = 1
ORDER BY t.reviewed_at DESC, t.id DESC
LIMIT 12;

-- name: TestimonialQueue :many
-- The operator's list: who wrote it, their shop if they own one, who reviewed it.
SELECT sqlc.embed(t), u.name AS user_name, u.email_address AS user_email, u.phone AS user_phone, u.role AS user_role,
       COALESCE((SELECT s.name FROM shops s WHERE s.owner_id = u.id ORDER BY s.id LIMIT 1), '')::varchar AS shop_name,
       r.name AS reviewed_by_name
FROM testimonials t
JOIN users u ON u.id = t.user_id
LEFT JOIN users r ON r.id = t.reviewed_by_id
WHERE (sqlc.narg(status)::int IS NULL OR t.status = sqlc.narg(status))
ORDER BY t.updated_at DESC, t.id DESC
LIMIT 500;

-- name: PendingTestimonialCount :one
SELECT COUNT(*) FROM testimonials WHERE status = 0;

-- name: ReviewTestimonial :execrows
UPDATE testimonials SET status = $2, reviewed_by_id = $3, reviewed_at = now(), updated_at = now() WHERE id = $1;
