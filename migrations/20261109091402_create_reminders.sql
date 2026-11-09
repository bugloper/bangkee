-- Reminding customers what they owe.
--
-- A shop chooses whether Bangkee reminds its overdue customers by itself, how
-- often (every_days) and at what hour of the day in Thimphu. An owner can
-- pause reminders for one customer; a customer can turn reminders off for
-- themselves. Every reminder — sent by Bangkee, sent by the owner from their
-- own WhatsApp or SMS, skipped, or failed — is a row in `reminders`.
--
--   reminders.kind     automatic | manual
--   reminders.channel  app (Bangkee's notification: in-app, push, email) | whatsapp | sms
--   reminders.status   sent | skipped | failed
--
-- At most one reminder from Bangkee reaches an account in a day, however many
-- times the job runs or the owner taps: the partial unique index.

-- +goose Up
ALTER TABLE shops
  ADD COLUMN reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN reminder_every_days integer NOT NULL DEFAULT 7
    CONSTRAINT shops_reminder_every_days_known CHECK (reminder_every_days IN (1, 3, 7, 14, 30)),
  ADD COLUMN reminder_hour integer NOT NULL DEFAULT 9
    CONSTRAINT shops_reminder_hour_daytime CHECK (reminder_hour BETWEEN 7 AND 20);
ALTER TABLE accounts ADD COLUMN reminders_paused boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN reminders_opt_out boolean NOT NULL DEFAULT false;

CREATE TABLE reminders (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES accounts (id),
  kind varchar NOT NULL CONSTRAINT reminders_kind_known CHECK (kind IN ('automatic', 'manual')),
  channel varchar NOT NULL CONSTRAINT reminders_channel_known CHECK (channel IN ('app', 'whatsapp', 'sms')),
  status varchar NOT NULL CONSTRAINT reminders_status_known CHECK (status IN ('sent', 'skipped', 'failed')),
  detail varchar,
  balance_cents bigint NOT NULL,
  sent_by_id bigint REFERENCES users (id),
  reminded_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_reminders_on_account_id_and_created_at ON reminders (account_id, created_at);
CREATE INDEX index_reminders_on_sent_by_id ON reminders (sent_by_id);
CREATE UNIQUE INDEX index_reminders_one_app_reminder_a_day ON reminders (account_id, reminded_on) WHERE channel = 'app' AND status = 'sent';

-- +goose Down
DROP TABLE reminders;
ALTER TABLE users DROP COLUMN reminders_opt_out;
ALTER TABLE accounts DROP COLUMN reminders_paused;
ALTER TABLE shops DROP COLUMN reminders_enabled, DROP COLUMN reminder_every_days, DROP COLUMN reminder_hour;
