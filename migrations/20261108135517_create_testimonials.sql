-- What shop owners and customers say about Bangkee, for the homepage. One
-- each, written from their Profile. Nothing is shown until the operator
-- approves it; changing it sends it back for review.
--
--   status  pending 0, approved 1, hidden 2

-- +goose Up
CREATE TABLE testimonials (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL UNIQUE REFERENCES users (id),
  body text NOT NULL,
  status integer NOT NULL DEFAULT 0,
  reviewed_by_id bigint REFERENCES users (id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_testimonials_on_status_and_reviewed_at ON testimonials (status, reviewed_at);

-- +goose Down
DROP TABLE testimonials;
