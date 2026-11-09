-- The customer's word on each entry in their book. The shop records; the
-- customer confirms it is right, or flags it as wrong with a reason. Neither
-- touches the balance — a flagged entry stays in the book until the shop
-- edits it or crosses it out.
--
--   transactions.confirmation  pending 0, confirmed 1, disputed 2
--
-- transaction_responses is the history, append-only: who said what, when.
--   action  confirmed | disputed | shop_replied | changed (the shop edited
--           the entry, so it waits for the customer again)

-- +goose Up
ALTER TABLE transactions ADD COLUMN confirmation integer NOT NULL DEFAULT 0
  CONSTRAINT transactions_confirmation_known CHECK (confirmation IN (0, 1, 2));
CREATE INDEX index_transactions_disputed ON transactions (account_id) WHERE confirmation = 2 AND crossed_out_at IS NULL;

CREATE TABLE transaction_responses (
  id bigserial PRIMARY KEY,
  transaction_id bigint NOT NULL REFERENCES transactions (id),
  user_id bigint NOT NULL REFERENCES users (id),
  action varchar NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_transaction_responses_on_transaction_id ON transaction_responses (transaction_id, created_at);
CREATE INDEX index_transaction_responses_on_user_id ON transaction_responses (user_id);

-- +goose Down
DROP TABLE transaction_responses;
DROP INDEX index_transactions_disputed;
ALTER TABLE transactions DROP COLUMN confirmation;
