# Append-only audit trail (BR-17). Events are written explicitly with their own
# metadata rather than derived from column diffs, so the log says what happened
# in domain terms ("voided"), not which columns moved.
module Auditable
  extend ActiveSupport::Concern

  included do
    has_many :audit_events, as: :auditable, dependent: :destroy
  end

  def log_audit(action, actor: nil, **metadata)
    audit_events.create!(action: action.to_s, actor: actor, metadata: metadata)
  end
end
