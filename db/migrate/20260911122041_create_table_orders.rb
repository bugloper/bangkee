# What a customer asked for from their phone, before anyone at the counter has
# agreed to it.
#
# An order is a request, not a charge. Anyone holding the table's QR can send
# one, so it must not become money owed until someone in the shop accepts it —
# at which point its lines are copied onto the table's tab and it behaves like
# anything else the shop wrote down itself.
class CreateTableOrders < ActiveRecord::Migration[8.1]
  def change
    create_table :table_orders do |t|
      t.references :shop, null: false, foreign_key: true
      t.references :shop_table, null: false, foreign_key: true
      # Set when the order is accepted onto a tab.
      t.references :tab, foreign_key: true

      t.integer  :status, null: false, default: 0   # 0 pending, 1 accepted, 2 rejected
      t.bigint   :total_cents, null: false, default: 0
      t.text     :note                              # "no chilli"
      t.datetime :placed_at, null: false
      t.references :reviewed_by, foreign_key: { to_table: :users }
      t.datetime :reviewed_at
      t.string   :rejection_reason
      t.timestamps
    end

    add_index :table_orders, [ :shop_id, :status ]

    create_table :table_order_items do |t|
      t.references :table_order, null: false, foreign_key: true
      # Kept for reference only: the name and price are copied, so editing the
      # menu later cannot rewrite what somebody already ordered.
      t.references :menu_item, foreign_key: true
      t.string  :name, null: false
      t.decimal :quantity, precision: 10, scale: 2, null: false, default: 1.0
      t.bigint  :unit_price_cents, null: false, default: 0
      t.timestamps
    end
  end
end
