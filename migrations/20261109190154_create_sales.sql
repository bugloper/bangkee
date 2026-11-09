-- Sales paid on the spot: what a shop takes at the counter besides credit.
--
-- A sale never touches anyone's balance and no customer sees it; it is the
-- shop's own record of its takings. It can name a customer (account_id) for
-- the shop's reference, and keeps its money if that customer is later
-- removed. Itemized sales list what was sold in sale_items, whose total is
-- the amount, as with an itemized credit.
--
--   sales.payment_method  Mobile transfer | Cash | Other
--
-- A sale is crossed out, never deleted, like a ledger entry.

-- +goose Up
CREATE TABLE sales (
  id bigserial PRIMARY KEY,
  shop_id bigint NOT NULL REFERENCES shops (id),
  account_id bigint REFERENCES accounts (id) ON DELETE SET NULL,
  created_by_id bigint NOT NULL REFERENCES users (id),
  amount_cents bigint NOT NULL CONSTRAINT sales_amount_positive CHECK (amount_cents > 0),
  payment_method varchar NOT NULL CONSTRAINT sales_payment_method_known CHECK (payment_method IN ('Mobile transfer', 'Cash', 'Other')),
  description varchar,
  itemized boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL,
  idempotency_key varchar,
  crossed_out_at timestamptz,
  crossed_out_by_id bigint REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_sales_on_shop_id_and_occurred_at ON sales (shop_id, occurred_at);
CREATE INDEX index_sales_on_account_id ON sales (account_id);
CREATE UNIQUE INDEX index_sales_on_idempotency_key ON sales (idempotency_key);

CREATE TABLE sale_items (
  id bigserial PRIMARY KEY,
  sale_id bigint NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  name varchar NOT NULL,
  quantity numeric(10, 2) NOT NULL DEFAULT 1.0,
  unit_price_cents bigint NOT NULL DEFAULT 0
);
CREATE INDEX index_sale_items_on_sale_id ON sale_items (sale_id);

-- +goose Down
DROP TABLE sale_items;
DROP TABLE sales;
