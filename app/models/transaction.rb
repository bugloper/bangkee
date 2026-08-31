class Transaction < ApplicationRecord
  include Auditable
  include HasMoneyAttribute

  belongs_to :account
  belongs_to :created_by, class_name: "User"
  belongs_to :voided_by,  class_name: "User", optional: true

  # NOT `belongs_to :transaction` — that name collides with ActiveRecord's own
  # `transaction` method. The purchase's items are reached as `line_items`.
  has_many :line_items, foreign_key: :transaction_id, dependent: :destroy, inverse_of: :purchase
  accepts_nested_attributes_for :line_items, allow_destroy: true,
    reject_if: ->(attrs) { attrs[:name].blank? && attrs[:unit_price].blank? && attrs[:unit_price_cents].blank? }

  has_one :payment_proof, foreign_key: :transaction_id, dependent: :nullify

  enum :kind, { credit: 0, payment: 1 }, validate: true

  has_money_attribute :amount

  before_validation :default_occurred_at
  before_validation :sync_itemized_total

  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }
  # Stamped by the browser for entries recorded offline; see IdempotentWrites.
  validates :idempotency_key, uniqueness: true, allow_nil: true

  after_save    -> { account.recompute_balance! }
  after_destroy -> { account.recompute_balance! }

  scope :active,        -> { where(voided_at: nil) }
  scope :voided,        -> { where.not(voided_at: nil) }
  scope :chronological, -> { order(:occurred_at, :id) }
  scope :recent,        -> { order(occurred_at: :desc, id: :desc) }

  def voided? = voided_at.present?

  # BR-9: a credit adds to what is owed, a payment subtracts.
  def signed_amount_cents = credit? ? amount_cents : -amount_cents

  # BR-15/BR-16: never deleted, only voided — and the void is on the record.
  def void!(by:)
    return false if voided?

    self.class.transaction do
      update!(voided_at: Time.current, voided_by: by)
      log_audit(:voided, actor: by, amount_cents: amount_cents, kind: kind)
    end
    true
  end

  private
    def default_occurred_at
      self.occurred_at ||= Time.current
    end

    # BR-12: for an itemized credit the line items are the source of truth.
    def sync_itemized_total
      return unless itemized?

      items = line_items.reject(&:marked_for_destruction?)
      return if items.empty?

      self.amount_cents = items.sum(&:total_cents)
    end
end
