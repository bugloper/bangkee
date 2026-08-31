require "test_helper"

class CustomerFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @customer = create_customer
    @account = create_account(@shop, customer: @customer)
    @shop.bank_accounts.create!(bank_name: "BoB", account_name: "Karma", account_number: "1023", primary: true)
    record_credit(@account, amount_cents: 100_000, by: @owner, description: "Groceries")
    sign_in_as @customer
  end

  test "every customer screen renders" do
    [ root_path, dashboard_path, account_path(@account), account_statement_path(@account),
      new_account_payment_proof_path(@account), notifications_path, settings_path ].each do |path|
      get path
      assert_response :success, "GET #{path} failed"
    end
  end

  test "the customer's own account is read-only and shows the shop's bank details" do
    get account_path(@account)
    assert_response :success
    assert_match "How to pay", response.body
    assert_match "1023", response.body
    assert_no_match "Add credit", response.body
    assert_no_match "Void", response.body
  end

  test "a customer cannot see another customer's account" do
    other = create_account(@shop, name: "Someone Else")
    get account_path(other)
    assert_redirected_to root_path
  end

  test "a customer cannot record transactions" do
    assert_no_difference -> { Transaction.count } do
      post account_credits_path(@account), params: { transaction: { amount: "500" } }
      post account_payments_path(@account), params: { transaction: { amount: "500" } }
    end
  end

  test "uploading a proof notifies the owner and leaves the balance alone (BR-29, BR-35)" do
    assert_difference [ -> { PaymentProof.count }, -> { @owner.notifications.count } ], 1 do
      post account_payment_proofs_path(@account), params: {
        payment_proof: { amount: "500", reference: "BT2608", screenshot: screenshot_upload }
      }
    end

    assert_redirected_to account_path(@account)
    assert_equal 100_000, @account.reload.balance_cents
    assert PaymentProof.last.pending?
  end

  test "a proof without a screenshot is refused" do
    assert_no_difference -> { PaymentProof.count } do
      post account_payment_proofs_path(@account), params: { payment_proof: { amount: "500" } }
    end
    assert_response :unprocessable_entity
  end

  test "a customer cannot upload proof for an account that is not theirs" do
    other = create_account(@shop, name: "Someone Else")
    assert_no_difference -> { PaymentProof.count } do
      post account_payment_proofs_path(other), params: {
        payment_proof: { amount: "500", screenshot: screenshot_upload }
      }
    end
    assert_redirected_to root_path
  end

  test "a customer never sees the owner's areas" do
    [ accounts_path, payment_proofs_path, bank_accounts_path, subscription_path, admin_root_path ].each do |path|
      get path
      assert_redirected_to root_path, "#{path} should be refused"
    end
  end

  test "an invite link claims the account for the signed-in customer (BR-24)" do
    unclaimed = create_account(@shop, name: "Pema Choden")

    get invitation_path(unclaimed.invite_token)
    assert_redirected_to account_path(unclaimed)
    assert_equal @customer, unclaimed.reload.customer
  end

  test "an already-claimed account refuses a second customer (BR-25)" do
    other_customer = create_customer(email: "other@example.bt")
    claimed = create_account(@shop, name: "Taken", customer: other_customer)

    get invitation_path(claimed.invite_token)
    assert_redirected_to root_path
    assert_equal other_customer, claimed.reload.customer
  end
end
