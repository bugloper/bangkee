# An order a customer sent from their phone. It is a request until somebody at
# the counter accepts it — anyone holding the table's QR can send one, and a
# stranger must not be able to put money on a shop's books.
class TableOrder < ApplicationRecord
  include Auditable
  include HasMoneyAttribute

  belongs_to :shop
  belongs_to :shop_table
  belongs_to :tab, optional: true
  belongs_to :reviewed_by, class_name: "User", optional: true

  has_many :table_order_items, dependent: :destroy

  enum :status, { pending: 0, accepted: 1, rejected: 2 }, validate: true

  has_money_attribute :total

  before_validation :default_placed_at, on: :create

  scope :recent,     -> { order(placed_at: :desc) }
  scope :for_counter, -> { pending.includes(:shop_table, :table_order_items).order(:placed_at) }

  def empty? = table_order_items.none?

  def recompute_total!
    # Queried afresh, never through the cached association — see Tab#recompute_total!
    update_columns(total_cents: TableOrderItem.where(table_order_id: id).sum(&:total_cents),
                   updated_at: Time.current)
  end

  # Accepting copies the lines onto the table's tab — opening one if the group
  # has not been set up yet — after which they are ordinary tab items.
  def accept!(by:)
    return false unless pending? && !empty?

    self.class.transaction do
      target = tab || shop_table.open_tab!(by: by)
      table_order_items.each do |item|
        target.tab_items.create!(name: item.name, quantity: item.quantity,
                                 unit_price_cents: item.unit_price_cents, added_by: by)
      end
      update!(status: :accepted, tab: target, reviewed_by: by, reviewed_at: Time.current)
      log_audit(:accepted, actor: by, amount_cents: total_cents, tab_id: target.id)
    end
    true
  end

  def reject!(by:, reason: nil)
    return false unless pending?

    self.class.transaction do
      update!(status: :rejected, reviewed_by: by, reviewed_at: Time.current,
              rejection_reason: reason.presence)
      log_audit(:rejected, actor: by, amount_cents: total_cents, reason: rejection_reason)
    end
    true
  end

  def waiting_for = ActiveSupport::Duration.build(Time.current - placed_at)

  private
    def default_placed_at
      self.placed_at ||= Time.current
    end
end
