# A place in the shop with a printed QR card on it. Scanning the card opens the
# menu for that table; ordering from it lands at the counter.
class ShopTable < ApplicationRecord
  belongs_to :shop
  has_many :tabs, dependent: :nullify
  has_many :table_orders, dependent: :destroy

  has_secure_token :token   # what the QR encodes

  validates :name, presence: true, uniqueness: { scope: :shop_id, case_sensitive: false }

  scope :active,  -> { where(active: true) }
  scope :ordered, -> { order(:position, :name) }

  # The tab this table is running now, if any. Ordering opens one when there
  # is none, so a group that starts by scanning never has to be set up by hand.
  def open_tab = tabs.open.order(:opened_at).last

  def open_tab!(by:)
    open_tab || shop.tabs.create!(label: name, shop_table: self, opened_by: by, opened_at: Time.current)
  end

  def pending_orders = table_orders.pending
end
