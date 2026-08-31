# §17 — a shop owner's manual payment to the Bangkee operator, reviewed by a
# platform admin. NOTE: the `method` column shadows Object#method, so it is
# always read through read_attribute.
class SubscriptionPayment < ApplicationRecord
  include Auditable
  include HasMoneyAttribute
  include AttachableImage

  belongs_to :shop
  belongs_to :submitted_by, class_name: "User"
  belongs_to :reviewed_by,  class_name: "User", optional: true

  has_one_attached :screenshot
  validates_attached_image :screenshot

  has_money_attribute :amount

  enum :status, { pending: 0, approved: 1, rejected: 2 }, validate: true

  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }
  validates :months, numericality: { only_integer: true, greater_than_or_equal_to: 1 }

  scope :recent,     -> { order(created_at: :desc) }
  scope :for_review, -> { where(status: :pending).order(:created_at) }

  def payment_method = read_attribute(:method)
  def payment_method=(value)
    write_attribute(:method, value)
  end

  def reviewed? = !pending?

  # BR-43/BR-45
  def approve!(by:)
    return false if reviewed?

    self.class.transaction do
      update!(status: :approved, reviewed_by: by, reviewed_at: Time.current)
      shop.subscription.extend_period!(months: months, by: by)
      log_audit(:approved, actor: by, amount_cents: amount_cents, months: months)
    end
    true
  end

  # BR-44
  def reject!(by:, reason:)
    return false if reviewed?

    self.class.transaction do
      update!(status: :rejected, reviewed_by: by, reviewed_at: Time.current,
              rejection_reason: reason.presence || "No reason given")
      log_audit(:rejected, actor: by, reason: rejection_reason)
    end
    true
  end
end
