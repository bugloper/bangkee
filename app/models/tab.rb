# A running bill for a customer who is still in the shop — the notebook by the
# till in a restaurant, a bar, a snooker hall. Items go on as they are ordered;
# at the end the tab is settled exactly one of two ways:
#
#   paid     — cash or transfer handed over there and then. Nothing is owed, so
#              nothing reaches the credit book; the tab itself is the record of
#              what was sold.
#   credited — put on the customer's page. That raises an ordinary itemized
#              credit (BR-12), so from then on it behaves like every other
#              entry in the ledger and the customer sees it.
#
# An open tab is never a balance. Until it is settled the customer is still
# ordering and may well pay cash.
class Tab < ApplicationRecord
  include Auditable
  include HasMoneyAttribute

  belongs_to :shop
  belongs_to :account, optional: true
  belongs_to :shop_table, optional: true
  belongs_to :opened_by,  class_name: "User"
  belongs_to :settled_by, class_name: "User", optional: true
  # NOT `transaction` — that name collides with ActiveRecord's own method.
  belongs_to :settlement_transaction, class_name: "Transaction",
             foreign_key: :transaction_id, optional: true

  has_many :tab_items, dependent: :destroy
  has_many :table_orders, dependent: :nullify

  enum :status, { open: 0, settled: 1, voided: 2 }, validate: true
  enum :settlement, { paid: 0, credited: 1, part_paid: 2 }, prefix: true

  has_money_attribute :total

  validates :label, presence: true

  before_validation :default_opened_at, on: :create

  scope :recent, -> { order(opened_at: :desc) }
  scope :settled_recently, -> { settled.order(settled_at: :desc) }

  def open_for
    ActiveSupport::Duration.build(Time.current - opened_at)
  end

  def empty? = tab_items.none?

  # Cached on the row so the tab list can show every running total without
  # summing line items per tab.
  def recompute_total!
    # Queried afresh rather than through `tab_items`: this runs from an item's
    # after_save, so the cached collection may not hold the row that triggered
    # it — and reloading the collection mid-create appends it twice. Summed in
    # Ruby so the rounding rule lives only in TabItem#total_cents.
    update_columns(total_cents: TabItem.where(tab_id: id).sum(&:total_cents),
                   updated_at: Time.current)
  end

  # Paid at the table. No credit, no payment transaction: nothing was ever
  # owed, and inventing a credit just to cancel it with a payment would put
  # noise in a ledger whose whole point is what is outstanding.
  def settle_paid!(by:, method: nil)
    return false unless open? && !empty?

    self.class.transaction do
      update!(status: :settled, settlement: :paid, payment_method: method.presence,
              paid_cents: total_cents, settled_by: by, settled_at: Time.current)
      log_audit(:settled_paid, actor: by, amount_cents: total_cents, method: payment_method)
    end
    true
  end

  # On the book. One itemized credit carrying every line, so the customer sees
  # what they ordered and the shop can void it like anything else.
  def settle_on_credit!(by:, account:)
    return false unless open? && !empty?
    return false unless account && account.shop_id == shop_id

    self.class.transaction do
      credit = build_credit_for(account, by)
      credit.save!

      update!(status: :settled, settlement: :credited, account: account,
              settled_by: by, settled_at: Time.current, settlement_transaction: credit)
      credit.log_audit(:created, actor: by, kind: "credit", amount_cents: credit.amount_cents, tab_id: id)
      log_audit(:settled_on_credit, actor: by, amount_cents: total_cents, account_id: account.id)
    end
    true
  end

  # Some of it now, the rest on the book — a group where one person pays cash
  # and the regular takes the remainder on their page.
  #
  # This raises both entries rather than only the difference: the customer's
  # page should show what they took and what they handed over, not a single
  # netted-off number that explains nothing six weeks later.
  def settle_part_paid!(by:, account:, paid_cents:, method: nil)
    return false unless open? && !empty?
    return false unless account && account.shop_id == shop_id
    return false unless paid_cents.to_i.positive? && paid_cents.to_i < total_cents

    self.class.transaction do
      credit = build_credit_for(account, by)
      credit.save!

      account.transactions.create!(
        kind: :payment, amount_cents: paid_cents, payment_method: method.presence || "Cash",
        description: "Paid at the table", occurred_at: Time.current, created_by: by
      )

      update!(status: :settled, settlement: :part_paid, account: account,
              paid_cents: paid_cents, payment_method: method.presence,
              settled_by: by, settled_at: Time.current, settlement_transaction: credit)
      credit.log_audit(:created, actor: by, kind: "credit", amount_cents: credit.amount_cents, tab_id: id)
      log_audit(:settled_part_paid, actor: by, amount_cents: total_cents,
                paid_cents: paid_cents, account_id: account.id)
    end
    true
  end

  # A tab opened by mistake, or a table that walked out before ordering.
  def void!(by:)
    return false unless open?

    self.class.transaction do
      update!(status: :voided, settled_by: by, settled_at: Time.current)
      log_audit(:voided, actor: by, amount_cents: total_cents)
    end
    true
  end

  def settlement_label
    return nil unless settled?

    case settlement
    when "paid"      then "Paid#{" · #{payment_method}" if payment_method.present?}"
    when "part_paid" then "Part paid, rest on the book"
    else                  "On the book"
    end
  end

  # What the customer was left owing after settling.
  def credited_cents
    return 0 unless settlement_credited? || settlement_part_paid?
    total_cents - paid_cents
  end

  private
    def default_opened_at
      self.opened_at ||= Time.current
    end

    def build_credit_for(account, by)
      credit = account.transactions.new(
        kind: :credit, itemized: true, occurred_at: Time.current,
        description: description_for_credit, created_by: by, amount_cents: total_cents
      )
      tab_items.each do |item|
        credit.line_items.build(name: item.name, quantity: item.quantity,
                                unit_price_cents: item.unit_price_cents)
      end
      credit
    end

    def description_for_credit
count = tab_items.size
      "#{label} · #{count} #{"item".pluralize(count)}"
    end
end
