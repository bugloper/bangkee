-- Three plans instead of one. Every shop so far was on the one plan, which is
-- now Basic, at the price it signed up at. A billing payment says which plan
-- it pays for; approving it moves the shop onto that plan.
--
--   subscriptions.plan, subscription_payments.plan   basic | pro | business

-- +goose Up
UPDATE subscriptions SET plan = 'basic' WHERE plan = 'standard';
ALTER TABLE subscriptions ALTER COLUMN plan SET DEFAULT 'basic',
  ADD CONSTRAINT subscriptions_plan_known CHECK (plan IN ('basic', 'pro', 'business'));
ALTER TABLE subscription_payments ADD COLUMN plan varchar NOT NULL DEFAULT 'basic'
  CONSTRAINT subscription_payments_plan_known CHECK (plan IN ('basic', 'pro', 'business'));

-- +goose Down
ALTER TABLE subscription_payments DROP COLUMN plan;
ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_known, ALTER COLUMN plan SET DEFAULT 'standard';
UPDATE subscriptions SET plan = 'standard';
