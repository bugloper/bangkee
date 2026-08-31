class AuditEvent < ApplicationRecord
  belongs_to :auditable, polymorphic: true
  belongs_to :actor, class_name: "User", optional: true

  scope :recent, -> { order(created_at: :desc) }

  # BR-18: an event with no actor was the system's doing.
  def actor_name = actor&.display_name || "System"
end
