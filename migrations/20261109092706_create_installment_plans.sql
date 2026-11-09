-- An agreement that a customer pays what they owe in installments. It is a
-- schedule, not money: payments are still recorded in the book as ever, and
-- how far through the plan a customer is comes from those payments (every
-- payment on the account since the plan started, oldest first, filling the
-- installments in order). A plan never changes a balance.
--
--   frequency  weekly | fortnightly | monthly
--   status     active | completed | cancelled  (completed: paid in full)

-- +goose Up
CREATE TABLE installment_plans (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES accounts (id),
  created_by_id bigint NOT NULL REFERENCES users (id),
  total_cents bigint NOT NULL CONSTRAINT installment_plans_total_positive CHECK (total_cents > 0),
  installment_count integer NOT NULL CONSTRAINT installment_plans_count_range CHECK (installment_count BETWEEN 2 AND 24),
  frequency varchar NOT NULL CONSTRAINT installment_plans_frequency_known CHECK (frequency IN ('weekly', 'fortnightly', 'monthly')),
  first_due_on date NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  notes varchar,
  status varchar NOT NULL DEFAULT 'active' CONSTRAINT installment_plans_status_known CHECK (status IN ('active', 'completed', 'cancelled')),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_installment_plans_on_account_id ON installment_plans (account_id, created_at);
CREATE INDEX index_installment_plans_on_created_by_id ON installment_plans (created_by_id);
-- One plan running per account at a time.
CREATE UNIQUE INDEX index_installment_plans_one_active ON installment_plans (account_id) WHERE status = 'active';

-- +goose Down
DROP TABLE installment_plans;
