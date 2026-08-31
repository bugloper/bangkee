class LineItem < ApplicationRecord
  include HasMoneyAttribute

  # The association is `purchase`, not `transaction` — see Transaction.
  belongs_to :purchase, class_name: "Transaction", foreign_key: :transaction_id, inverse_of: :line_items

  has_money_attribute :unit_price

  validates :name, presence: true
  validates :quantity, numericality: { greater_than: 0 }
  validates :unit_price_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  # BR-13
  def total_cents = (quantity.to_d * unit_price_cents.to_i).round
end
