# A tab points at the credit it raised. Deleting a customer deletes their
# transactions, and the tab's foreign key was blocking that — removing a
# settled-up customer who had ever been put on a tab raised a
# ForeignKeyViolation. The sale itself stays on record; only the link goes.
class NullifyTabTransactionOnDelete < ActiveRecord::Migration[8.1]
  def up
    remove_foreign_key :tabs, :transactions
    add_foreign_key :tabs, :transactions, on_delete: :nullify
  end

  def down
    remove_foreign_key :tabs, :transactions
    add_foreign_key :tabs, :transactions
  end
end
