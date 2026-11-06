-- +goose Up
-- Where the shop is on a map: both set (the owner dropped a pin) or neither.
ALTER TABLE shops ADD COLUMN latitude double precision, ADD COLUMN longitude double precision,
  ADD CONSTRAINT shops_coordinates_together CHECK ((latitude IS NULL) = (longitude IS NULL));

-- +goose Down
ALTER TABLE shops DROP CONSTRAINT shops_coordinates_together, DROP COLUMN latitude, DROP COLUMN longitude;
