-- What shop owners and customers tell Bangkee from their Profile: feedback, a
-- feature they want, or a problem they need help with. The operator reads
-- them on the console, acknowledges them, and replies.
--
--   kind    feedback | feature | support
--   status  new 0, acknowledged 1, replied 2

-- +goose Up
CREATE TABLE feedback (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id),
  kind varchar NOT NULL,
  body text NOT NULL,
  status integer NOT NULL DEFAULT 0,
  reply text,
  reviewed_by_id bigint REFERENCES users (id),
  acknowledged_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_feedback_on_status_and_created_at ON feedback (status, created_at);
CREATE INDEX index_feedback_on_user_id_and_created_at ON feedback (user_id, created_at);

-- +goose Down
DROP TABLE feedback;
