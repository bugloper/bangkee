-- The operator console reads activity across every shop by when entries were
-- recorded; without this it would scan the whole table for each period.

-- +goose Up
CREATE INDEX index_transactions_on_created_at ON transactions (created_at);

-- +goose Down
DROP INDEX index_transactions_on_created_at;
