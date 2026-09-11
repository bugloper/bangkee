# A running bill: what a customer has ordered so far, while they are still in
# the shop. Restaurants, bars and snooker halls keep one per table and settle it
# when the customer leaves — either paid there and then, or moved onto their
# page in the credit book.
#
# It is deliberately not a Transaction until it is settled. An open tab is not
# yet owed: the customer is still ordering, and half of them pay cash before
# they go.
class CreateTabs < ActiveRecord::Migration[8.1]
  def change
    create_table :tabs do |t|
      t.references :shop, null: false, foreign_key: true
      # Set when the tab belongs to someone already in the book. A walk-in has
      # only a label until the moment they ask to put it on their account.
      t.references :account, foreign_key: true

      t.string  :label,  null: false          # "Table 4", "Snooker 2", "Dorji"
      t.integer :status, null: false, default: 0   # 0 open, 1 settled, 2 voided
      t.bigint  :total_cents, null: false, default: 0

      t.references :opened_by, null: false, foreign_key: { to_table: :users }
      t.datetime   :opened_at, null: false

      t.integer    :settlement                # 0 paid, 1 credited
      t.string     :payment_method
      t.datetime   :settled_at
      t.references :settled_by, foreign_key: { to_table: :users }
      # The credit raised when a tab goes on the book. Named settlement_
      # because an association called `transaction` collides with
      # ActiveRecord's own method (see Transaction, PaymentProof).
      t.references :transaction, foreign_key: true

      t.text :note
      t.timestamps
    end

    add_index :tabs, [ :shop_id, :status ]
  end
end
