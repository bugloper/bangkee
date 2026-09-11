# One line on a running bill — "2 × Beer", "1 × Chicken fried rice", an hour of
# snooker. Shaped like line_items, but line_items hang off a Transaction that
# does not exist yet; these are copied across when the tab is settled onto the
# book.
class CreateTabItems < ActiveRecord::Migration[8.1]
  def change
    create_table :tab_items do |t|
      t.references :tab, null: false, foreign_key: true
      t.string  :name, null: false
      t.decimal :quantity, precision: 10, scale: 2, null: false, default: 1.0
      t.bigint  :unit_price_cents, null: false, default: 0
      t.references :added_by, null: false, foreign_key: { to_table: :users }
      t.timestamps
    end

    # Ordering the quick-add suggestions: what this shop sells most.
    add_index :tab_items, :name
  end
end
