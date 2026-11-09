-- What happened to a reminder after Bangkee sent it, and reminders Bangkee
-- sends by WhatsApp itself.
--
-- notification_deliveries: each notification's push and email, sent or
-- failed (none is written when the person has no phone subscribed or no
-- email address). A reminder points at its notification, so its history
-- shows how it actually went out.
--
-- reminders.channel gains 'bangkee_whatsapp': a reminder Bangkee sent
-- through the WhatsApp Business (Cloud) API, to a customer who has not joined
-- the app — as opposed to 'whatsapp', which the owner sent from their own
-- phone. Like 'app', at most one a day reaches an account.

-- +goose Up
CREATE TABLE notification_deliveries (
  id bigserial PRIMARY KEY,
  notification_id bigint NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
  channel varchar NOT NULL CONSTRAINT notification_deliveries_channel_known CHECK (channel IN ('push', 'email')),
  status varchar NOT NULL CONSTRAINT notification_deliveries_status_known CHECK (status IN ('sent', 'failed')),
  detail varchar,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_notification_deliveries_on_notification_id ON notification_deliveries (notification_id);

ALTER TABLE reminders ADD COLUMN notification_id bigint REFERENCES notifications (id) ON DELETE SET NULL;
CREATE INDEX index_reminders_on_notification_id ON reminders (notification_id);

ALTER TABLE reminders DROP CONSTRAINT reminders_channel_known;
ALTER TABLE reminders ADD CONSTRAINT reminders_channel_known CHECK (channel IN ('app', 'whatsapp', 'sms', 'bangkee_whatsapp'));
DROP INDEX index_reminders_one_app_reminder_a_day;
CREATE UNIQUE INDEX index_reminders_one_bangkee_reminder_a_day ON reminders (account_id, reminded_on)
  WHERE channel IN ('app', 'bangkee_whatsapp') AND status = 'sent';

-- +goose Down
DROP INDEX index_reminders_one_bangkee_reminder_a_day;
DELETE FROM reminders WHERE channel = 'bangkee_whatsapp';
CREATE UNIQUE INDEX index_reminders_one_app_reminder_a_day ON reminders (account_id, reminded_on) WHERE channel = 'app' AND status = 'sent';
ALTER TABLE reminders DROP CONSTRAINT reminders_channel_known;
ALTER TABLE reminders ADD CONSTRAINT reminders_channel_known CHECK (channel IN ('app', 'whatsapp', 'sms'));
ALTER TABLE reminders DROP COLUMN notification_id;
DROP TABLE notification_deliveries;
