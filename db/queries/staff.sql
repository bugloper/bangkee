-- name: ActiveMembership :one
-- The shop a staff member works in now, with their role.
SELECT sqlc.embed(m), sqlc.embed(s) FROM shop_members m JOIN shops s ON s.id = m.shop_id
WHERE m.user_id = $1 AND m.revoked_at IS NULL;

-- name: ShopMembers :many
SELECT sqlc.embed(m), u.name, COALESCE(u.email_address, '')::varchar AS email_address
FROM shop_members m JOIN users u ON u.id = m.user_id
WHERE m.shop_id = $1 AND m.revoked_at IS NULL ORDER BY m.created_at, m.id;

-- name: MemberInShop :one
SELECT * FROM shop_members WHERE id = $1 AND shop_id = $2 AND revoked_at IS NULL;

-- name: CreateMember :one
INSERT INTO shop_members (shop_id, user_id, role, invited_by_id) VALUES ($1, $2, $3, $4) RETURNING *;

-- name: SetMemberRole :exec
UPDATE shop_members SET role = $2, updated_at = now() WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeMember :execrows
UPDATE shop_members SET revoked_at = now(), revoked_by_id = $2, updated_at = now() WHERE id = $1 AND revoked_at IS NULL;

-- name: CreateStaffInvitation :one
INSERT INTO staff_invitations (shop_id, name, email_address, role, token, invited_by_id, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: PendingStaffInvitations :many
SELECT * FROM staff_invitations
WHERE shop_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at, id;

-- name: StaffInvitationByToken :one
SELECT sqlc.embed(i), s.name AS shop_name FROM staff_invitations i JOIN shops s ON s.id = i.shop_id WHERE i.token = $1;

-- name: AcceptStaffInvitation :execrows
UPDATE staff_invitations SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now();

-- name: RevokeStaffInvitation :execrows
UPDATE staff_invitations SET revoked_at = now() WHERE id = $1 AND shop_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL;

-- name: StaffSeatsTaken :one
-- Members, and invitations still open: both hold a place on the plan.
SELECT ((SELECT COUNT(*) FROM shop_members m WHERE m.shop_id = $1 AND m.revoked_at IS NULL) +
        (SELECT COUNT(*) FROM staff_invitations i WHERE i.shop_id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()))::bigint;
