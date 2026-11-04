-- Bangkee's schema.
--
-- Enums are integers:
--   users.role                 shop_owner 0, customer 1
--   transactions.kind          credit 0, payment 1
--   subscriptions.status       trialing 0, active 1, past_due 2, disabled 3
--   subscription_payments      pending 0, approved 1, rejected 2
--
-- Files live in active_storage_blobs (one row per stored file, found by its
-- key: storage/<key[0..2]>/<key[2..4]>/<key> on disk, <key> in the bucket)
-- and active_storage_attachments (which record a file belongs to, by type
-- name and field name):
--   Transaction / screenshot          the customer's payment screen, photographed at the counter
--   SubscriptionPayment / screenshot  a shop's transfer to Bangkee
--   MenuItem / image                  an item's photo

-- +goose Up

-- bangkee_phone() is the one way phone numbers are compared: digits only,
-- without Bhutan's 975 in front — "17 61 23 45", "+975 17612345" and
-- "17612345" are the same phone.
-- +goose StatementBegin
CREATE FUNCTION bangkee_phone(phone text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(d) = 11 AND left(d, 3) = '975' THEN substr(d, 4) ELSE d END
  FROM (SELECT regexp_replace(coalesce(phone, ''), '\D', '', 'g') AS d) digits
$$;
-- +goose StatementEnd

-- Shop owners sign in with email and password. Customers join from a shop's
-- invite link with a name and a 4-digit PIN and sign in with phone and PIN:
-- they have no email, and the PIN's digest sits where a password's would.
CREATE TABLE users (
  id bigserial PRIMARY KEY,
  email_address varchar,
  password_digest varchar NOT NULL,
  name varchar NOT NULL,
  phone varchar,
  locale varchar,
  role integer NOT NULL DEFAULT 1,
  platform_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX index_users_on_email_address ON users (email_address);
CREATE INDEX index_users_on_phone ON users (phone);
CREATE INDEX index_users_on_bangkee_phone ON users (bangkee_phone(phone));
-- One sign-in per phone for customers who have only a phone.
CREATE UNIQUE INDEX index_users_on_phone_without_email ON users (bangkee_phone(phone)) WHERE email_address IS NULL;

CREATE TABLE sessions (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id),
  token varchar,
  ip_address varchar,
  user_agent varchar,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX index_sessions_on_token ON sessions (token);
CREATE INDEX index_sessions_on_user_id ON sessions (user_id);

-- kind: what sort of business, for customers browsing shops by type.
CREATE TABLE shops (
  id bigserial PRIMARY KEY,
  owner_id bigint NOT NULL REFERENCES users (id),
  name varchar NOT NULL,
  kind varchar,
  credit_due_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_shops_on_owner_id ON shops (owner_id);
CREATE INDEX index_shops_on_kind ON shops (kind);

-- A customer's credit book at one shop. pin_reset_until: the shop has sent
-- a fresh link to set a new PIN, good until then.
CREATE TABLE accounts (
  id bigserial PRIMARY KEY,
  shop_id bigint NOT NULL REFERENCES shops (id),
  customer_id bigint REFERENCES users (id),
  customer_name varchar NOT NULL,
  customer_phone varchar,
  invite_token varchar NOT NULL,
  pin_reset_until timestamptz,
  balance_cents bigint NOT NULL DEFAULT 0,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_accounts_on_customer_id ON accounts (customer_id);
CREATE UNIQUE INDEX index_accounts_on_invite_token ON accounts (invite_token);
CREATE INDEX index_accounts_on_shop_id_and_customer_id ON accounts (shop_id, customer_id);
CREATE INDEX index_accounts_on_shop_id_and_bangkee_phone ON accounts (shop_id, bangkee_phone(customer_phone));
CREATE INDEX index_accounts_on_shop_id ON accounts (shop_id);

CREATE TABLE transactions (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES accounts (id),
  created_by_id bigint NOT NULL REFERENCES users (id),
  crossed_out_by_id bigint REFERENCES users (id),
  kind integer NOT NULL DEFAULT 0,
  amount_cents bigint NOT NULL DEFAULT 0,
  description varchar,
  notes text,
  payment_method varchar,
  itemized boolean NOT NULL DEFAULT false,
  idempotency_key varchar,
  occurred_at timestamptz NOT NULL,
  crossed_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_transactions_on_account_id_and_kind ON transactions (account_id, kind);
CREATE INDEX index_transactions_on_account_id_and_occurred_at ON transactions (account_id, occurred_at);
CREATE INDEX index_transactions_on_account_id ON transactions (account_id);
CREATE INDEX index_transactions_on_created_by_id ON transactions (created_by_id);
CREATE UNIQUE INDEX index_transactions_on_idempotency_key ON transactions (idempotency_key);
CREATE INDEX index_transactions_on_crossed_out_by_id ON transactions (crossed_out_by_id);

CREATE TABLE line_items (
  id bigserial PRIMARY KEY,
  transaction_id bigint NOT NULL REFERENCES transactions (id),
  name varchar NOT NULL,
  quantity numeric(10, 2) NOT NULL DEFAULT 1.0,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_line_items_on_transaction_id ON line_items (transaction_id);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  auditable_type varchar NOT NULL,
  auditable_id bigint NOT NULL,
  actor_id bigint REFERENCES users (id),
  action varchar NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_audit_events_on_actor_id ON audit_events (actor_id);
CREATE INDEX index_audit_events_on_auditable_and_created_at ON audit_events (auditable_type, auditable_id, created_at);
CREATE INDEX index_audit_events_on_auditable_type_and_auditable_id ON audit_events (auditable_type, auditable_id);

-- Where a shop's customers can transfer money to.
CREATE TABLE bank_accounts (
  id bigserial PRIMARY KEY,
  shop_id bigint NOT NULL REFERENCES shops (id),
  bank_name varchar NOT NULL,
  account_name varchar NOT NULL,
  account_number varchar NOT NULL,
  branch varchar,
  mobile_wallet varchar,
  instructions text,
  "primary" boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_bank_accounts_on_shop_id_and_primary ON bank_accounts (shop_id, "primary");
CREATE INDEX index_bank_accounts_on_shop_id ON bank_accounts (shop_id);

CREATE TABLE subscriptions (
  id bigserial PRIMARY KEY,
  shop_id bigint NOT NULL REFERENCES shops (id),
  plan varchar NOT NULL DEFAULT 'standard',
  price_cents bigint NOT NULL DEFAULT 20000,
  status integer NOT NULL DEFAULT 0,
  current_period_end timestamptz NOT NULL,
  grace_until timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX index_subscriptions_on_shop_id ON subscriptions (shop_id);

CREATE TABLE subscription_payments (
  id bigserial PRIMARY KEY,
  shop_id bigint NOT NULL REFERENCES shops (id),
  submitted_by_id bigint NOT NULL REFERENCES users (id),
  reviewed_by_id bigint REFERENCES users (id),
  amount_cents bigint NOT NULL DEFAULT 0,
  months integer NOT NULL DEFAULT 1,
  method varchar,
  reference varchar,
  status integer NOT NULL DEFAULT 0,
  rejection_reason varchar,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_subscription_payments_on_reviewed_by_id ON subscription_payments (reviewed_by_id);
CREATE INDEX index_subscription_payments_on_shop_id_and_status ON subscription_payments (shop_id, status);
CREATE INDEX index_subscription_payments_on_shop_id ON subscription_payments (shop_id);
CREATE INDEX index_subscription_payments_on_submitted_by_id ON subscription_payments (submitted_by_id);

-- The things a shop sells: picked from when recording a credit, and shown
-- to customers browsing the shop.
CREATE TABLE menu_items (
  id bigserial PRIMARY KEY,
  shop_id bigint NOT NULL REFERENCES shops (id),
  name varchar NOT NULL,
  category varchar,
  price_cents bigint NOT NULL DEFAULT 0,
  available boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX index_menu_items_on_shop_id_and_name ON menu_items (shop_id, name);
CREATE INDEX index_menu_items_on_shop_id ON menu_items (shop_id);

CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id),
  kind varchar NOT NULL,
  title varchar NOT NULL,
  body varchar,
  path varchar,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_notifications_on_user_id_and_created_at ON notifications (user_id, created_at);
CREATE INDEX index_notifications_on_user_id_and_read_at ON notifications (user_id, read_at);
CREATE INDEX index_notifications_on_user_id ON notifications (user_id);

CREATE TABLE push_subscriptions (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id),
  endpoint varchar NOT NULL,
  p256dh_key varchar NOT NULL,
  auth_key varchar NOT NULL,
  user_agent varchar,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX index_push_subscriptions_on_endpoint ON push_subscriptions (endpoint);
CREATE INDEX index_push_subscriptions_on_user_id ON push_subscriptions (user_id);

CREATE TABLE active_storage_blobs (
  id bigserial PRIMARY KEY,
  key varchar NOT NULL,
  filename varchar NOT NULL,
  content_type varchar,
  metadata text,
  service_name varchar NOT NULL,
  byte_size bigint NOT NULL,
  checksum varchar,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX index_active_storage_blobs_on_key ON active_storage_blobs (key);

CREATE TABLE active_storage_attachments (
  id bigserial PRIMARY KEY,
  name varchar NOT NULL,
  record_type varchar NOT NULL,
  record_id bigint NOT NULL,
  blob_id bigint NOT NULL REFERENCES active_storage_blobs (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_active_storage_attachments_on_blob_id ON active_storage_attachments (blob_id);
CREATE UNIQUE INDEX index_active_storage_attachments_uniqueness
  ON active_storage_attachments (record_type, record_id, name, blob_id);

-- +goose Down
DROP TABLE active_storage_attachments, active_storage_blobs, push_subscriptions, notifications, menu_items,
  subscription_payments, subscriptions, bank_accounts, audit_events, line_items, transactions, accounts, shops,
  sessions, users;
DROP FUNCTION bangkee_phone(text);
