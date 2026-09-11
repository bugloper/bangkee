# A tab opened by scanning belongs to the table whose card was scanned, so the
# next order from that card joins the same bill instead of starting a new one.
class AddShopTableToTabs < ActiveRecord::Migration[8.1]
  def change
    add_reference :tabs, :shop_table, foreign_key: true
  end
end
