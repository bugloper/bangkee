-- A shop's profile, shown to customers above its items: a line about it,
-- where it is, a number to call and when it is open. All optional.

-- +goose Up
ALTER TABLE shops
  ADD COLUMN about varchar,
  ADD COLUMN location varchar,
  ADD COLUMN phone varchar,
  ADD COLUMN hours varchar;

-- +goose Down
ALTER TABLE shops DROP COLUMN about, DROP COLUMN location, DROP COLUMN phone, DROP COLUMN hours;
