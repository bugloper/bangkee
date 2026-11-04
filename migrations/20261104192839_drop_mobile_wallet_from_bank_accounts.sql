-- A shop's bank details no longer carry a mobile wallet number: customers pay
-- to the account number.

-- +goose Up
ALTER TABLE bank_accounts DROP COLUMN mobile_wallet;

-- +goose Down
ALTER TABLE bank_accounts ADD COLUMN mobile_wallet varchar;
