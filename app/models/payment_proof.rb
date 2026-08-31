# §16 — a customer's claim that they have paid by transfer. A proof never moves
# the balance; only the owner's confirmation does (BR-29/BR-30).
class PaymentProof < ApplicationRecord
  include Auditable
  include HasMoneyAttribute
  include AttachableImage

  belongs_to :account
  belongs_to :submitted_by, class_name: "User"
  belongs_to :reviewed_by,  class_name: "User", optional: true
  # `belongs_to :transaction` would collide with ActiveRecord's own method.
  belongs_to :payment_transaction, class_name: "Transaction",
             foreign_key: :transaction_id, optional: true

  has_one_attached :screenshot
  validates_attached_image :screenshot

  has_money_attribute :amount

  enum :status, { pending: 0, confirmed: 1, rejected: 2 }, validate: true

  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }

  scope :recent, -> { order(created_at: :desc) }
  scope :for_review, -> { where(status: :pending).order(:created_at) }

  def reviewed? = !pending?

  # BR-30/BR-32: atomic, and a no-op once reviewed.
  def confirm!(by:)
    return false if reviewed?

    self.class.transaction do
      payment = account.transactions.create!(
        kind: :payment,
        amount_cents: amount_cents,
        payment_method: "Bank transfer",
        description: "Bank transfer confirmed",
        notes: [ reference.presence && "Ref #{reference}", note.presence ].compact.join(" · ").presence,
        occurred_at: Time.current,
        created_by: by
      )
      update!(status: :confirmed, reviewed_by: by, reviewed_at: Time.current,
              payment_transaction: payment)
      log_audit(:confirmed, actor: by, amount_cents: amount_cents, transaction_id: payment.id)
    end
    true
  end

  # BR-31: nothing moves, but the customer learns why.
  def reject!(by:, reason:)
    return false if reviewed?

    self.class.transaction do
      update!(status: :rejected, reviewed_by: by, reviewed_at: Time.current,
              rejection_reason: reason.presence || "No reason given")
      log_audit(:rejected, actor: by, amount_cents: amount_cents, reason: rejection_reason)
    end
    true
  end

  def status_label
    case status
    when "pending"   then "Pending review"
    when "confirmed" then "Confirmed"
    else                  "Rejected"
    end
  end
end
