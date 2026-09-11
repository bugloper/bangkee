# Stamped by the browser when a round is added with no signal and replayed
# later. A replay can arrive twice — the browser retried, the phone came back
# online while the request was still in flight — and a bar tab is exactly the
# place where a duplicated beer starts an argument.
class AddIdempotencyKeyToTabItems < ActiveRecord::Migration[8.1]
  def change
    add_column :tab_items, :idempotency_key, :string
    add_index :tab_items, :idempotency_key, unique: true
  end
end
