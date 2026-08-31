# Where a shop owner sends their Nu 200. Manual billing, so this is just the
# operator's own account details, configurable without a migration.
class OperatorBilling
  DEFAULTS = {
    bank_name: "Bank of Bhutan",
    account_name: "Bangkee",
    account_number: "1010 2030 4050",
    branch: "Thimphu Main",
    mobile_wallet: "mBoB 17 12 34 56",
    price_cents: 20_000
  }.freeze

  class << self
    def bank_name     = ENV.fetch("BANGKEE_BANK_NAME", DEFAULTS[:bank_name])
    def account_name  = ENV.fetch("BANGKEE_ACCOUNT_NAME", DEFAULTS[:account_name])
    def account_number = ENV.fetch("BANGKEE_ACCOUNT_NUMBER", DEFAULTS[:account_number])
    def branch        = ENV.fetch("BANGKEE_BRANCH", DEFAULTS[:branch])
    def mobile_wallet = ENV.fetch("BANGKEE_WALLET", DEFAULTS[:mobile_wallet])
    def price_cents   = ENV.fetch("BANGKEE_PRICE_CENTS", DEFAULTS[:price_cents]).to_i

    def instructions
      "Transfer Nu. #{price_cents / 100} per month to the account below, then " \
      "upload the transfer screenshot here. Bangkee approves payments within one working day."
    end
  end
end
