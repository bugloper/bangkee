-- People who work in a shop besides its owner. A staff member signs in with
-- their own email and password (users.role 2, staff) and belongs to one shop
-- at a time; what they may do there is their role:
--
--   shop_members.role  manager (everything but the owner's settings) |
--                      cashier (record credits and payments, add customers) |
--                      viewer  (read only)
--
-- Taking someone off the staff keeps the row (revoked_at) — their entries
-- stay attributed to them — and signs them out everywhere.
--
-- staff_invitations: the owner invites by name and email; the link is good
-- for 7 days and once. Joining creates the person's login.

-- +goose Up
CREATE TABLE shop_members (
  id bigserial PRIMARY KEY,
  shop_id bigint NOT NULL REFERENCES shops (id),
  user_id bigint NOT NULL REFERENCES users (id),
  role varchar NOT NULL CONSTRAINT shop_members_role_known CHECK (role IN ('manager', 'cashier', 'viewer')),
  invited_by_id bigint REFERENCES users (id),
  revoked_at timestamptz,
  revoked_by_id bigint REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_shop_members_on_shop_id ON shop_members (shop_id);
CREATE INDEX index_shop_members_on_invited_by_id ON shop_members (invited_by_id);
CREATE INDEX index_shop_members_on_revoked_by_id ON shop_members (revoked_by_id);
-- One shop at a time for each person.
CREATE UNIQUE INDEX index_shop_members_one_active ON shop_members (user_id) WHERE revoked_at IS NULL;

CREATE TABLE staff_invitations (
  id bigserial PRIMARY KEY,
  shop_id bigint NOT NULL REFERENCES shops (id),
  name varchar NOT NULL,
  email_address varchar NOT NULL,
  role varchar NOT NULL CONSTRAINT staff_invitations_role_known CHECK (role IN ('manager', 'cashier', 'viewer')),
  token varchar NOT NULL,
  invited_by_id bigint NOT NULL REFERENCES users (id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX index_staff_invitations_on_token ON staff_invitations (token);
CREATE INDEX index_staff_invitations_on_shop_id ON staff_invitations (shop_id);
CREATE INDEX index_staff_invitations_on_invited_by_id ON staff_invitations (invited_by_id);

-- +goose Down
DROP TABLE staff_invitations, shop_members;
