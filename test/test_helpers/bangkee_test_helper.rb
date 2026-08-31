# The domain has enough required associations that fixtures would obscure more
# than they explain; these builders make each test say what it is about.
module BangkeeTestHelper
  def create_owner(name: "Karma Dorji", email: nil, shop_name: "Karma General Shop")
    user = User.create!(name: name, email_address: email || "owner#{SecureRandom.hex(4)}@shop.bt",
                        password: "password", role: :shop_owner)
    Shop.create!(name: shop_name, owner: user)
    user
  end

  def create_customer(name: "Tashi Wangmo", email: nil)
    User.create!(name: name, email_address: email || "cust#{SecureRandom.hex(4)}@example.bt",
                 password: "password", role: :customer)
  end

  def create_admin
    User.create!(name: "Bangkee Operator", email_address: "admin#{SecureRandom.hex(4)}@bangkee.bt",
                 password: "password", role: :shop_owner, platform_admin: true)
  end

  def create_account(shop, name: "Tashi Wangmo", customer: nil)
    shop.accounts.create!(customer_name: name, customer: customer)
  end

  def record_credit(account, amount_cents:, by:, **attributes)
    account.transactions.create!(kind: :credit, amount_cents: amount_cents, created_by: by, **attributes)
  end

  def record_payment(account, amount_cents:, by:, **attributes)
    account.transactions.create!(kind: :payment, amount_cents: amount_cents, created_by: by, **attributes)
  end

  def screenshot_upload
    Rack::Test::UploadedFile.new(screenshot_path, "image/png")
  end

  def screenshot_path
    path = Rails.root.join("test/fixtures/files/screenshot.png")
    unless path.exist?
      path.dirname.mkpath
      # A 1×1 PNG is enough to exercise attachment and validation.
      path.binwrite(Base64.decode64(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
      ))
    end
    path
  end
end

ActiveSupport.on_load(:active_support_test_case) do
  include BangkeeTestHelper
end
