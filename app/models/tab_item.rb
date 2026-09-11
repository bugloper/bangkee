# One order on a running bill. Same shape as a LineItem, but a LineItem needs a
# Transaction to hang off and a tab has none until it is settled.
class TabItem < ApplicationRecord
  include HasMoneyAttribute

  belongs_to :tab
  belongs_to :added_by, class_name: "User"

  has_money_attribute :unit_price

  validates :name, presence: true
  validates :quantity, numericality: { greater_than: 0 }
  validates :unit_price_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  after_save    -> { tab.recompute_total! }
  after_destroy -> { tab.recompute_total! }

  def total_cents = (quantity.to_d * unit_price_cents.to_i).round

  def quantity_label = quantity.to_s.sub(/\.0+$/, "")
end
