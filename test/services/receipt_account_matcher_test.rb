require "test_helper"

# Matching decides which shop a receipt is offered against. Getting it wrong
# would put a payment claim in front of the wrong shopkeeper, so ambiguity has
# to resolve to "ask", never to a guess.
class ReceiptAccountMatcherTest < ActiveSupport::TestCase
  setup do
    @customer = create_customer

    @karma = create_owner(email: "karma@shop.bt", shop_name: "Karma General Shop")
    @karma.shop.bank_accounts.create!(bank_name: "Bank of Bhutan", account_name: "Karma Dorji",
                                      account_number: "1023 4567 8901", primary: true)
    @karma_account = create_account(@karma.shop, name: "Dawa", customer: @customer)

    @norbu = create_owner(email: "norbu@shop.bt", shop_name: "Norbu Mart")
    @norbu.shop.bank_accounts.create!(bank_name: "BNB", account_name: "Norbu Wangdi",
                                      account_number: "5100 0234 5600")
    @norbu_account = create_account(@norbu.shop, name: "Dawa", customer: @customer)
  end

  test "an exact account number picks the shop" do
    assert_equal @karma_account, match(recipient_account: "1023 4567 8901")
  end

  test "a masked account number matches on the digits the bank left visible" do
    assert_equal @karma_account, match(recipient_account: "····8901")
    assert_equal @norbu_account, match(recipient_account: "XXXXXXXX5600")
  end

  test "too few digits to be sure is not a match" do
    assert_nil match(recipient_account: "··01"), "two digits could be any account"
  end

  test "the account holder's name matches when the number does not" do
    assert_equal @norbu_account, match(recipient_account: nil, recipient_name: "Norbu Wangdi")
  end

  test "the shop's own name matches too" do
    assert_equal @karma_account, match(recipient_account: nil, recipient_name: "karma general shop")
  end

  test "two shops that both fit resolves to nobody" do
    # A second shop publishes an account ending in the same digits.
    @norbu.shop.bank_accounts.create!(bank_name: "PNB", account_name: "Norbu Wangdi",
                                      account_number: "9999 9999 8901")

    assert_nil match(recipient_account: "····8901"), "the customer has to choose"
  end

  test "a shop the customer has no account with is never matched" do
    stranger = create_owner(email: "stranger@shop.bt", shop_name: "Zhemgang Traders")
    stranger.shop.bank_accounts.create!(bank_name: "BoB", account_name: "Sangay Tenzin",
                                        account_number: "7777 8888 9999")

    assert_nil match(recipient_account: "7777 8888 9999")
  end

  test "a hidden bank account is not matched against" do
    @karma.shop.bank_accounts.sole.update!(active: false)
    assert_nil match(recipient_account: "1023 4567 8901")
  end

  test "nothing to go on is not a match" do
    assert_nil match(recipient_account: nil, recipient_name: nil)
  end

  private
    def match(recipient_account: nil, recipient_name: nil)
      receipt = SharedReceipt.new(user: @customer, recipient_account: recipient_account,
                                  recipient_name: recipient_name)
      ReceiptAccountMatcher.new(receipt).call
    end
end
