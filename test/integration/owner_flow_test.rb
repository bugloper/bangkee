require "test_helper"

# Walks the owner through the whole book: every screen renders, and the write
# paths actually change the ledger.
class OwnerFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @account = create_account(@shop)
    sign_in_as @owner
  end

  test "every owner screen renders" do
    record_credit(@account, amount_cents: 120_000, by: @owner, description: "Groceries")
    @shop.bank_accounts.create!(bank_name: "BoB", account_name: "Karma", account_number: "1023", primary: true)

    [ root_path, dashboard_path, accounts_path, accounts_path(filter: "overdue"),
      accounts_path(q: "Tashi"), new_account_path, account_path(@account),
      edit_account_path(@account), new_account_credit_path(@account),
      new_account_credit_path(@account, mode: "itemized"), new_account_payment_path(@account),
      account_statement_path(@account), account_invite_path(@account),
      payment_proofs_path, bank_accounts_path, new_bank_account_path,
      settings_path, subscription_path, notifications_path, offline_path ].each do |path|
      get path
      assert_response :success, "GET #{path} failed"
    end
  end

  test "recording a simple credit moves the balance and notifies the customer" do
    customer = create_customer
    @account.claim!(customer)

    assert_difference -> { customer.notifications.count }, 1 do
      post account_credits_path(@account), params: {
        transaction: { amount: "1250", description: "Groceries", itemized: "0" }
      }
    end

    assert_redirected_to account_path(@account)
    assert_equal 125_000, @account.reload.balance_cents
    assert_equal "created", @account.transactions.last.audit_events.first.action
  end

  test "recording an itemized credit sums the line items" do
    post account_credits_path(@account), params: {
      transaction: {
        itemized: "1",
        line_items_attributes: {
          "0" => { name: "Rice 25 kg", quantity: "1", unit_price: "620" },
          "1" => { name: "Oil 1 L", quantity: "2", unit_price: "95" },
          "2" => { name: "", quantity: "1", unit_price: "" }   # blank row is dropped
        }
      }
    }

    transaction = @account.transactions.last
    assert transaction.itemized?
    assert_equal 2, transaction.line_items.count
    assert_equal 81_000, transaction.amount_cents
  end

  test "recording a payment reduces the balance" do
    record_credit(@account, amount_cents: 100_000, by: @owner)

    post account_payments_path(@account), params: {
      transaction: { amount: "400", payment_method: "Cash" }
    }

    assert_equal 60_000, @account.reload.balance_cents
    assert_equal "Cash", @account.transactions.payment.last.payment_method
  end

  test "voiding takes an entry out of the balance but leaves it on the page" do
    transaction = record_credit(@account, amount_cents: 40_000, by: @owner, description: "School supplies")

    patch void_transaction_path(transaction)
    assert_redirected_to account_path(@account)
    assert_equal 0, @account.reload.balance_cents

    get account_path(@account)
    assert_match "School supplies", response.body
    assert_match "VOIDED", response.body
  end

  test "an owner cannot touch another shop's account" do
    other_account = create_account(create_owner(email: "other@shop.bt").shop)

    get account_path(other_account)
    assert_redirected_to root_path

    assert_no_difference -> { Transaction.count } do
      post account_credits_path(other_account), params: { transaction: { amount: "100" } }
    end
  end

  test "a customer with a balance cannot be removed by accident" do
    record_credit(@account, amount_cents: 5_000, by: @owner)

    assert_no_difference -> { Account.count } do
      delete account_path(@account)
    end
    assert_redirected_to account_path(@account)
  end
end
