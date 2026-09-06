# A bank receipt shared into Bangkee from the bank's own app (Web Share Target).
# It arrives before we know which shop it is for, and the amount has to be read
# out of the picture, so it cannot be a payment_proof yet — §16 requires an
# account and a positive amount up front.
#
# NOTE: the schema stopped being a single consolidated migration here. There is
# real shop data in development now, so rebuilding the database is no longer
# free and every change from this point is an ordinary migration.
class CreateSharedReceipts < ActiveRecord::Migration[8.1]
  def change
    create_table :shared_receipts do |t|
      t.references :user, null: false, foreign_key: true

      t.integer :status, null: false, default: 0   # 0 received 1 reading 2 read 3 unreadable
      t.string  :shared_title                      # what the bank app sent alongside the image
      t.text    :shared_text

      # What was read out of the receipt. All nullable: a blurry photo still
      # deserves a form, just an empty one.
      t.bigint   :amount_cents
      t.string   :reference
      t.string   :recipient_name
      t.string   :recipient_account
      t.string   :sender_name
      t.string   :bank_name
      t.datetime :paid_at
      t.string   :confidence                       # high / medium / low, as read
      t.jsonb    :extraction, null: false, default: {}
      t.string   :failure_reason

      # The account this receipt looks like it settles, matched on the shop's
      # published bank details. A guess the customer confirms, never a decision.
      t.references :matched_account, foreign_key: { to_table: :accounts }
      t.references :payment_proof, foreign_key: true

      t.timestamps
    end

    add_index :shared_receipts, [ :user_id, :created_at ]
  end
end
