# Which language this person reads Bangkee in. Null means "whatever the app
# defaults to", which keeps every existing account on English without a
# backfill.
class AddLocaleToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :locale, :string
  end
end
