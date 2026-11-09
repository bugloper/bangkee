-- The shop's own book with the people it buys from: what it bought on credit
-- and what it has paid them. Kept apart from the customer book on purpose —
-- customers owe the shop, the shop owes suppliers, and no total ever adds
-- the two. Entries follow the customer book's rules: never deleted, only
-- crossed out, and the balance is recomputed from them on every change.
--
--   supplier_entries.kind  purchase 0 (the shop owes more), payment 1 (less)

-- +goose Up
CREATE TABLE suppliers (
  id bigserial PRIMARY KEY,
  shop_id bigint NOT NULL REFERENCES shops (id),
  name varchar NOT NULL,
  phone varchar,
  notes varchar,
  balance_cents bigint NOT NULL DEFAULT 0,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX index_suppliers_on_shop_id_and_name ON suppliers (shop_id, lower(name));

CREATE TABLE supplier_entries (
  id bigserial PRIMARY KEY,
  supplier_id bigint NOT NULL REFERENCES suppliers (id),
  created_by_id bigint NOT NULL REFERENCES users (id),
  crossed_out_by_id bigint REFERENCES users (id),
  kind integer NOT NULL CONSTRAINT supplier_entries_kind_known CHECK (kind IN (0, 1)),
  amount_cents bigint NOT NULL CONSTRAINT supplier_entries_amount_positive CHECK (amount_cents > 0),
  description varchar,
  notes varchar,
  payment_method varchar,
  idempotency_key varchar,
  occurred_at timestamptz NOT NULL,
  crossed_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_supplier_entries_on_supplier_id_and_occurred_at ON supplier_entries (supplier_id, occurred_at);
CREATE INDEX index_supplier_entries_on_created_by_id ON supplier_entries (created_by_id);
CREATE INDEX index_supplier_entries_on_crossed_out_by_id ON supplier_entries (crossed_out_by_id);
CREATE UNIQUE INDEX index_supplier_entries_on_idempotency_key ON supplier_entries (idempotency_key);

-- +goose Down
DROP TABLE supplier_entries, suppliers;
