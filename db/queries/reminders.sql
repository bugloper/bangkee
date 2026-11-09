-- name: InsertReminder :one
-- A Bangkee reminder already sent to this account today makes this a no-op
-- (the partial unique index): `inserted` is false.
WITH row AS (
  INSERT INTO reminders (account_id, kind, channel, status, detail, balance_cents, sent_by_id, reminded_on)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (account_id, reminded_on) WHERE channel = 'app' AND status = 'sent' DO NOTHING
  RETURNING id
)
SELECT COALESCE((SELECT id FROM row), 0)::bigint AS id;

-- name: MarkReminderFailed :exec
UPDATE reminders SET status = 'failed', detail = $2 WHERE id = $1;

-- name: LastReminderDay :one
-- The Thimphu day this account was last reminded or tried, by any channel;
-- 1970-01-01 if never. Automatic reminders keep the shop's pace from here,
-- so an account that was skipped is not tried again every day.
SELECT COALESCE(MAX(reminded_on), '1970-01-01'::date)::date AS day FROM reminders WHERE account_id = $1 AND status <> 'failed';

-- name: AccountReminders :many
SELECT r.*, u.name AS sent_by_name FROM reminders r LEFT JOIN users u ON u.id = r.sent_by_id
WHERE r.account_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT 50;

-- name: ShopsDueForReminders :many
-- The shops whose reminder hour this is.
SELECT * FROM shops WHERE reminders_enabled AND reminder_hour = $1 ORDER BY id;

-- name: OpenDisputeCount :one
SELECT COUNT(*)::bigint FROM transactions WHERE account_id = $1 AND confirmation = 2 AND crossed_out_at IS NULL;

-- name: UpdateReminderSettings :exec
UPDATE shops SET reminders_enabled = $2, reminder_every_days = $3, reminder_hour = $4, updated_at = now() WHERE id = $1;

-- name: SetRemindersPaused :exec
UPDATE accounts SET reminders_paused = $2, updated_at = now() WHERE id = $1;

-- name: SetRemindersOptOut :exec
UPDATE users SET reminders_opt_out = $2, updated_at = now() WHERE id = $1;

-- name: DeleteAccountReminders :exec
DELETE FROM reminders WHERE account_id = $1;
