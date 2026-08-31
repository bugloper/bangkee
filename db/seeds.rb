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

# §16 — a queue with something in it, so the review screen and the screenshot
# viewer have something real to show.
SCREENSHOT = Rails.root.join("db/seed_assets/transfer_screenshot.png")

def attach_screenshot(record)
  record.screenshot.attach(io: File.open(SCREENSHOT), filename: "transfer.png", content_type: "image/png")
end

if PaymentProof.none?
  pema = shop.accounts.find_by(customer_name: "Pema Choden")
  kinley = shop.accounts.find_by(customer_name: "Kinley Zangmo")
  ugyen = shop.accounts.find_by(customer_name: "Ugyen Penjor")
  pema.update!(customer: customer) if pema.customer_id.nil? && customer.accounts.where(shop: shop).count < 2

  pending = pema.payment_proofs.new(amount_cents: 50_000, submitted_by: pema.customer || customer,
                                    reference: "BT26082911022", note: "Paid for last month's rice.",
                                    created_at: 2.days.ago)
  attach_screenshot(pending)
  pending.save!

  second = kinley.payment_proofs.new(amount_cents: 100_000, submitted_by: customer, created_at: 1.day.ago)
  attach_screenshot(second)
  second.save!

  refused = ugyen.payment_proofs.new(amount_cents: 200_000, submitted_by: customer,
                                     reference: "BT26081208887", created_at: 19.days.ago)
  attach_screenshot(refused)
  refused.save!
  refused.reject!(by: owner, reason: "Amount does not match the transfer received")
end

# §17 — one payment waiting on the operator, so the admin queue is not empty.
if SubscriptionPayment.none?
  request = shop.subscription_payments.new(amount_cents: 20_000, months: 1, submitted_by: owner,
                                           method: "Bank transfer", reference: "BT26081400431")
  attach_screenshot(request)
  request.save!
end

puts "Seeded: #{Shop.count} shop, #{Account.count} accounts, #{Transaction.count} transactions, " \
     "#{PaymentProof.pending.count} pending proofs."
puts "  owner    karma@shop.bt / #{PASSWORD}"
puts "  customer dawa@example.bt / #{PASSWORD}"
puts "  operator admin@bangkee.bt / #{PASSWORD}"
