-- Inventory: an item may keep a count of what is on the shelf.
--
--   menu_items.stock         whole units on the shelf; NULL = not counted
--   menu_items.low_stock_at  warn when the count falls to this or under
--   menu_items.cost_cents    the latest buying price of one unit
--
-- A credit or sale line picked from the shop's items links to it, so stock
-- follows what leaves the shop. Lines recorded before stay unlinked.
--
-- stock_movements is each item's history of how its count moved:
--   started | restock | correction | credit | sale | credit_crossed_out | sale_crossed_out

-- +goose Up
ALTER TABLE menu_items
  ADD COLUMN stock integer,
  ADD COLUMN low_stock_at integer CONSTRAINT menu_items_low_stock_at_positive CHECK (low_stock_at >= 0),
  ADD COLUMN cost_cents bigint CONSTRAINT menu_items_cost_cents_positive CHECK (cost_cents >= 0);

ALTER TABLE line_items ADD COLUMN menu_item_id bigint REFERENCES menu_items (id) ON DELETE SET NULL;
CREATE INDEX index_line_items_on_menu_item_id ON line_items (menu_item_id);
ALTER TABLE sale_items ADD COLUMN menu_item_id bigint REFERENCES menu_items (id) ON DELETE SET NULL;
CREATE INDEX index_sale_items_on_menu_item_id ON sale_items (menu_item_id);

CREATE TABLE stock_movements (
  id bigserial PRIMARY KEY,
  menu_item_id bigint NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
  change integer NOT NULL,
  stock_after integer NOT NULL,
  reason varchar NOT NULL CONSTRAINT stock_movements_reason_known
    CHECK (reason IN ('started', 'restock', 'correction', 'credit', 'sale', 'credit_crossed_out', 'sale_crossed_out')),
  unit_cost_cents bigint,
  transaction_id bigint REFERENCES transactions (id) ON DELETE SET NULL,
  sale_id bigint REFERENCES sales (id) ON DELETE SET NULL,
  notes varchar,
  created_by_id bigint NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_stock_movements_on_menu_item_id_and_created_at ON stock_movements (menu_item_id, created_at);
CREATE INDEX index_stock_movements_on_transaction_id ON stock_movements (transaction_id);
CREATE INDEX index_stock_movements_on_sale_id ON stock_movements (sale_id);

-- +goose Down
DROP TABLE stock_movements;
ALTER TABLE sale_items DROP COLUMN menu_item_id;
ALTER TABLE line_items DROP COLUMN menu_item_id;
ALTER TABLE menu_items DROP COLUMN cost_cents, DROP COLUMN low_stock_at, DROP COLUMN stock;
