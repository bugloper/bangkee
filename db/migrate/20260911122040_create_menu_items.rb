# What the shop sells, priced, for a customer to read on their own phone.
#
# The tab's quick-add chips are learned from history and need no menu — but a
# diner scanning a code cannot be asked to type "Ema datshi 180", so ordering
# needs a real list with real prices.
class CreateMenuItems < ActiveRecord::Migration[8.1]
  def change
    create_table :menu_items do |t|
      t.references :shop, null: false, foreign_key: true
      t.string  :name, null: false
      t.string  :category                      # "Drinks", "Food" — optional grouping
      t.bigint  :price_cents, null: false, default: 0
      t.boolean :available, null: false, default: true
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    add_index :menu_items, [ :shop_id, :name ], unique: true
  end
end
