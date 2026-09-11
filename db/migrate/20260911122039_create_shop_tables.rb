# A physical place in the shop that keeps its identity between sittings —
# table 4, snooker 2, the counter stool by the door. A tab comes and goes with
# each group of customers; the printed QR card on the table does not, so the
# thing the QR points at has to outlive the tab.
#
# Named ShopTable rather than Table: a model called Table sitting next to
# ActiveRecord's own table vocabulary is a trap for whoever reads it next.
class CreateShopTables < ActiveRecord::Migration[8.1]
  def change
    create_table :shop_tables do |t|
      t.references :shop, null: false, foreign_key: true
      t.string  :name, null: false
      # What the QR encodes. Unguessable, because anyone holding it can order.
      t.string  :token, null: false
      t.boolean :active, null: false, default: true
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    add_index :shop_tables, :token, unique: true
    add_index :shop_tables, [ :shop_id, :name ], unique: true
  end
end
