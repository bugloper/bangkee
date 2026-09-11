class Account < ApplicationRecord
  include Auditable

  belongs_to :shop
  belongs_to :customer, class_name: "User", optional: true
  has_many :transactions, dependent: :destroy
  has_many :payment_proofs, dependent: :destroy
  has_many :tabs, dependent: :nullify

  has_secure_token :invite_token

  normalizes :customer_phone, with: ->(p) { p.strip.presence }

  validates :customer_name, presence: true

  scope :outstanding, -> { where("balance_cents > 0") }
  scope :settled,     -> { where("balance_cents <= 0") }
  scope :by_name,     -> { order(:customer_name) }

  def display_name = customer_name

  def joined? = customer_id.present?

  # BR-19: owed money, and nothing has happened for longer than the shop allows.
  def overdue?
    return false unless balance_cents.positive?
    last_activity_at.nil? || last_activity_at < shop.credit_due_days.days.ago
  end

  def days_overdue
    return 0 unless overdue?
    reference = last_activity_at || created_at
    ((Time.current - reference) / 1.day).floor
  end

  def settled?  = balance_cents.zero?
  def in_credit? = balance_cents.negative?

  # BR-6/BR-7. Cached on the row so lists don't aggregate per customer.
  def recompute_balance!
    active = transactions.active
    update_columns(
      balance_cents: active.credit.sum(:amount_cents) - active.payment.sum(:amount_cents),
      last_activity_at: active.maximum(:occurred_at),
      updated_at: Time.current
    )
  end

  # BR-10: chronological, each row annotated with the balance after it applies.
  # Voided entries never affect the running balance (BR-11); pass
  # include_voided: true to show them anyway, which is what the ledger screen
  # does — the entry stays visible, struck through, with no balance of its own.
  def ledger(include_voided: false)
    scope = include_voided ? transactions.chronological : transactions.active.chronological
    running = 0

    scope.includes(:created_by, :line_items).map do |transaction|
      if transaction.voided?
        [ transaction, nil ]
      else
        running += transaction.signed_amount_cents
        [ transaction, running ]
      end
    end
  end

  # BR-24: link this account to a signed-in customer.
  def claim!(user)
    return false if joined?
    transaction do
      update!(customer: user, customer_phone: customer_phone.presence || user.phone)
      log_audit(:customer_joined, actor: user)
    end
    true
  end
end
