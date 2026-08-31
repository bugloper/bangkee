require "test_helper"

# SRS §16 review queue and §17 billing, through the web UI.
class SettlementAndBillingTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @customer = create_customer
    @account = create_account(@shop, customer: @customer)
    record_credit(@account, amount_cents: 100_000, by: @owner)
    @proof = build_proof
  end

  test "every notified event also emails the person it concerns (§16.7)" do
    sign_in_as @owner

    # Confirming a proof concerns the customer.
    assert_enqueued_emails 1 do
      patch confirm_payment_proof_path(@proof)
    end

    perform_enqueued_jobs only: ActionMailer::MailDeliveryJob
    email = ActionMailer::Base.deliveries.last
    assert_equal [ @customer.email_address ], email.to
    assert_match "confirmed", email.subject.downcase

    # A credit concerns the customer too — and an unlinked account has nobody
    # to email, which must not raise.
    unlinked = create_account(@shop, name: "Not Yet Joined")
    assert_enqueued_emails 0 do
      record_credit(unlinked, amount_cents: 1_000, by: @owner)
      Notifier.credit_recorded(unlinked.transactions.last)
    end
  end

  test "notification delivery is out of band, so a mail server cannot block a write (§16.9)" do
    sign_in_as @owner
    ActionMailer::Base.deliveries.clear

    assert_difference -> { @account.transactions.count }, 1 do
      assert_enqueued_emails 1 do
        post account_credits_path(@account), params: { transaction: { amount: "100" } }
      end
    end

    assert_empty ActionMailer::Base.deliveries,
      "the request must not wait on SMTP — the email is queued, not sent inline"
  end

  test "the owner confirms a proof and the payment appears on the ledger (BR-30)" do
    sign_in_as @owner

    assert_difference [ -> { @account.transactions.count }, -> { @customer.notifications.count } ], 1 do
      patch confirm_payment_proof_path(@proof)
    end

    assert_redirected_to payment_proofs_path
    assert_equal 50_000, @account.reload.balance_cents
    assert @proof.reload.confirmed?
  end

  test "the owner rejects a proof with a reason and nothing moves (BR-31)" do
    sign_in_as @owner

    assert_no_difference -> { @account.transactions.count } do
      patch reject_payment_proof_path(@proof), params: { rejection_reason: "Amount does not match" }
    end

    assert @proof.reload.rejected?
    assert_equal "Amount does not match", @proof.rejection_reason
    assert_equal 100_000, @account.reload.balance_cents
  end

  test "another shop's owner cannot review the proof (BR-33)" do
    sign_in_as create_owner(email: "other@shop.bt")

    patch confirm_payment_proof_path(@proof)
    assert_response :not_found
    assert @proof.reload.pending?
  end

  test "a customer cannot review proofs" do
    sign_in_as @customer
    patch confirm_payment_proof_path(@proof)
    assert_redirected_to root_path
    assert @proof.reload.pending?
  end

  # ------------------------------------------------------------------- §17
  test "a write-locked owner keeps every read but loses every write (BR-40, BR-41)" do
    lock_subscription
    sign_in_as @owner

    [ dashboard_path, accounts_path, account_path(@account), account_statement_path(@account),
      payment_proofs_path, bank_accounts_path, subscription_path, settings_path ].each do |path|
      get path
      assert_response :success, "#{path} must stay readable"
    end

    transaction = record_credit(@account, amount_cents: 1_000, by: @owner)
    assert_no_difference -> { Transaction.count } do
      post account_credits_path(@account), params: { transaction: { amount: "500" } }
      assert_redirected_to subscription_path
      post account_payments_path(@account), params: { transaction: { amount: "500" } }
      assert_redirected_to subscription_path
    end

    patch void_transaction_path(transaction)
    assert_redirected_to subscription_path
    assert_not transaction.reload.voided?

    patch confirm_payment_proof_path(@proof)
    assert_redirected_to subscription_path
    assert @proof.reload.pending?
  end

  test "a locked shop never blocks its customers (BR-41)" do
    lock_subscription
    sign_in_as @customer

    get account_path(@account)
    assert_response :success

    assert_difference -> { PaymentProof.count }, 1 do
      post account_payment_proofs_path(@account), params: {
        payment_proof: { amount: "500", screenshot: screenshot_upload }
      }
    end
  end

  test "the owner submits a subscription payment and the admin approves it" do
    sign_in_as @owner
    admin = create_admin

    assert_difference [ -> { SubscriptionPayment.count }, -> { admin.notifications.count } ], 1 do
      post subscription_payments_path, params: {
        subscription_payment: { amount: "400", months: "2", method: "Bank transfer",
                                screenshot: screenshot_upload }
      }
    end
    assert_redirected_to subscription_path

    payment = SubscriptionPayment.last
    period_end = @shop.subscription.current_period_end

    sign_in_as admin
    get admin_root_path
    assert_response :success
    get admin_subscription_payments_path
    assert_response :success
    get admin_shops_path
    assert_response :success

    assert_difference -> { @owner.notifications.count }, 1 do
      patch approve_admin_subscription_payment_path(payment)
    end

    assert payment.reload.approved?
    assert_in_delta period_end + 2.months, @shop.subscription.reload.current_period_end, 5.seconds
  end

  test "only a platform admin reaches the admin area (BR-42)" do
    sign_in_as @owner
    payment = @shop.subscription_payments.create!(amount_cents: 20_000, months: 1, submitted_by: @owner,
      screenshot: screenshot_upload)

    [ admin_root_path, admin_subscription_payments_path, admin_shops_path ].each do |path|
      get path
      assert_redirected_to root_path
    end

    patch approve_admin_subscription_payment_path(payment)
    assert_redirected_to root_path
    assert payment.reload.pending?
  end

  private
    def build_proof
      proof = @account.payment_proofs.new(amount_cents: 50_000, submitted_by: @customer)
      proof.screenshot.attach(io: File.open(screenshot_path), filename: "proof.png", content_type: "image/png")
      proof.save!
      proof
    end

    def lock_subscription
      @shop.subscription.update!(current_period_end: 40.days.ago, grace_until: 26.days.ago)
    end
end
