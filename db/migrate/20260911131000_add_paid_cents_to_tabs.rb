# How much of a tab was handed over at the table. Only meaningful for a tab
# that was part paid; recorded rather than inferred, because working it out
# from the payment that happens to sit next to the credit in time is a guess.
class AddPaidCentsToTabs < ActiveRecord::Migration[8.1]
  def change
    add_column :tabs, :paid_cents, :bigint, null: false, default: 0
  end
end
