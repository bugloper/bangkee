# One line on a customer's order. The name and price are copied from the menu
# rather than read through it, so correcting the menu tomorrow cannot change
# what somebody ordered today.
class TableOrderItem < ApplicationRecord
  include HasMoneyAttribute

  belongs_to :table_order
  belongs_to :menu_item, optional: true

  has_money_attribute :unit_price

  validates :name, presence: true
  validates :quantity, numericality: { greater_than: 0 }
  validates :unit_price_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  after_save    -> { table_order.recompute_total! }
  after_destroy -> { table_order.recompute_total! }

  def total_cents = (quantity.to_d * unit_price_cents.to_i).round
  def quantity_label = quantity.to_s.sub(/\.0+$/, "")
end
