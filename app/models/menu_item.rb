# One line on the menu a customer reads on their phone.
class MenuItem < ApplicationRecord
  include HasMoneyAttribute

  belongs_to :shop
  has_many :table_order_items, dependent: :nullify

  has_money_attribute :price

  validates :name, presence: true, uniqueness: { scope: :shop_id, case_sensitive: false }
  validates :price_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  normalizes :category, with: ->(value) { value.strip.presence }

  scope :available, -> { where(available: true) }
  scope :ordered,   -> { order(:position, :name) }

  UNGROUPED = "Everything else".freeze

  # Grouped for the public menu, with ungrouped items last.
  def self.grouped
    ordered.group_by { |item| item.category.presence || UNGROUPED }
           .sort_by { |category, _| category == UNGROUPED ? 1 : 0 }
  end
end
