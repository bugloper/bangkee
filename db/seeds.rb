# Demo data — a shop with a month of real-looking book-keeping, so every screen
# has something to show. Idempotent: run it as often as you like.
return if Rails.env.production?

PASSWORD = "password"

admin = User.find_or_create_by!(email_address: "admin@bangkee.bt") do |user|
  user.name = "Bangkee Operator"
  user.password = PASSWORD
  user.role = :shop_owner
end
admin.update!(platform_admin: true)

owner = User.find_or_create_by!(email_address: "karma@shop.bt") do |user|
  user.name = "Karma Dorji"
  user.phone = "17 55 66 77"
  user.password = PASSWORD
  user.role = :shop_owner
end

shop = owner.owned_shops.first || Shop.create!(name: "Karma General Shop", owner: owner)

shop.bank_accounts.find_or_create_by!(account_number: "1023 4567 8901") do |bank|
  bank.bank_name = "Bank of Bhutan"
  bank.account_name = "Karma Dorji"
  bank.branch = "Thimphu Main"
  bank.mobile_wallet = "mBoB 17 55 66 77"
  bank.primary = true
  bank.instructions = "Send the screenshot right after transferring so I can confirm it the same day."
end

customer = User.find_or_create_by!(email_address: "dawa@example.bt") do |user|
  user.name = "Dawa Tashi"
  user.phone = "17 61 23 45"
  user.password = PASSWORD
  user.role = :customer
end

PEOPLE = [
  { name: "Tashi Wangmo",  phone: "17 61 23 45", credits: [ [ 1_200, "Groceries — monthly", 29 ], [ 800, "Festival goods", 9 ] ], payments: [ [ 500, "Cash", 16 ] ] },
  { name: "Pema Choden",   phone: "77 23 45 67", credits: [ [ 600, "Vegetables and dry goods", 26 ], [ 460, "Household items", 13 ] ], payments: [ [ 200, "Cash", 19 ] ] },
  { name: "Sonam Tobgay",  phone: "17 89 01 23", credits: [ [ 750, "Monthly groceries", 28 ] ], payments: [ [ 750, "Mobile transfer", 3 ] ] },
  { name: "Dechen Lhamo",  phone: nil,           credits: [], payments: [ [ 300, "Cash", 6 ] ] },
  { name: "Ugyen Penjor",  phone: "77 44 55 66", credits: [ [ 3_500, "Building materials", 59 ], [ 1_620, "Cement — 4 bags", 34 ] ], payments: [] },
  { name: "Kinley Zangmo", phone: "17 33 44 55", credits: [ [ 1_250, "Shop goods on tick", 6 ] ], payments: [] }
]

PEOPLE.each_with_index do |person, index|
  account = shop.accounts.find_or_create_by!(customer_name: person[:name]) do |record|
    record.customer_phone = person[:phone]
  end
  account.update!(customer: customer) if index.zero? && account.customer_id.nil?
  next if account.transactions.any?

  person[:credits].each do |amount, description, days_ago|
    account.transactions.create!(kind: :credit, amount_cents: amount * 100, description: description,
                                 occurred_at: days_ago.days.ago, created_by: owner)
  end
  person[:payments].each do |amount, method, days_ago|
    account.transactions.create!(kind: :payment, amount_cents: amount * 100, payment_method: method,
                                 occurred_at: days_ago.days.ago, created_by: owner)
  end
  account.log_audit(:account_created, actor: owner, customer_name: account.customer_name)
end

# An itemized purchase, so that screen has something real in it.
first = shop.accounts.order(:id).first
unless first.transactions.where(itemized: true).exists?
  purchase = first.transactions.create!(kind: :credit, itemized: true, occurred_at: 21.days.ago,
                                        description: "Itemized purchase", created_by: owner, amount_cents: 1)
  [ [ "Rice 25 kg", 1, 620 ], [ "Cooking oil 1 L", 2, 95 ], [ "Salt 1 kg", 2, 70 ] ].each do |name, quantity, price|
    purchase.line_items.create!(name: name, quantity: quantity, unit_price_cents: price * 100)
  end
  purchase.save!   # sync_itemized_total sets the amount from the items
end

# A voided entry, so the void treatment is visible.
unless first.transactions.voided.exists?
  voided = first.transactions.create!(kind: :credit, amount_cents: 40_000, description: "School supplies",
                                      occurred_at: 11.days.ago, created_by: owner)
  voided.void!(by: owner)
end

puts "Seeded: #{Shop.count} shop, #{Account.count} accounts, #{Transaction.count} transactions."
puts "  owner    karma@shop.bt / #{PASSWORD}"
puts "  customer dawa@example.bt / #{PASSWORD}"
puts "  operator admin@bangkee.bt / #{PASSWORD}"
