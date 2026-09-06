require "test_helper"

# Sharing a receipt out of a bank's app and into Bangkee, end to end.
class SharedReceiptFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @shop.bank_accounts.create!(bank_name: "Bank of Bhutan", account_name: "Karma Dorji",
                                account_number: "1023 4567 8901", primary: true)
    @customer = create_customer
    @account = create_account(@shop, customer: @customer)
    record_credit(@account, amount_cents: 100_000, by: @owner)
  end

  test "the manifest offers Bangkee as a share target for receipt images" do
    get pwa_manifest_path
    assert_response :success

    target = JSON.parse(response.body).fetch("share_target")
    assert_equal shared_receipts_path, target["action"]
    assert_equal "POST", target["method"]
    assert_equal "multipart/form-data", target["enctype"],
      "a file share has to be multipart or the image never arrives"

    files = target.dig("params", "files").sole
    assert_equal "receipt", files["name"], "must match the param the controller reads"
    assert_includes files["accept"], "image/jpeg"
  end

  test "sharing a receipt stores it and starts reading it" do
    sign_in_as @customer

    assert_difference -> { SharedReceipt.count }, 1 do
      assert_enqueued_with job: ReceiptExtractionJob do
        post shared_receipts_path, params: { receipt: screenshot_upload, title: "Fund transfer" }
      end
    end

    receipt = SharedReceipt.last
    assert_redirected_to receipt
    assert_equal @customer, receipt.user
    assert receipt.image.attached?
    assert receipt.received?
    assert_equal "Fund transfer", receipt.shared_title
  end

  test "a share with no picture says so instead of failing silently" do
    sign_in_as @customer

    assert_no_difference -> { SharedReceipt.count } do
      post shared_receipts_path, params: { title: "Just some text" }
    end
    assert_redirected_to root_path
  end

  test "a receipt shared before signing in survives the sign-in" do
    # The share sheet POSTs with no session; the body is gone after the
    # redirect, so the image has to be banked first.
    assert_difference -> { ActiveStorage::Blob.count }, 1 do
      post shared_receipts_path, params: { receipt: screenshot_upload }
    end
    assert_redirected_to new_session_path
    assert_equal 0, SharedReceipt.count, "nothing is owned until someone is signed in"

    assert_difference -> { SharedReceipt.count }, 1 do
      post session_path, params: { email_address: @customer.email_address, password: "password" }
    end

    receipt = SharedReceipt.last
    assert_redirected_to receipt
    assert_equal @customer, receipt.user
    assert receipt.image.attached?
  end

  test "the waiting screen polls, and the read screen does not" do
    sign_in_as @customer
    receipt = share

    get shared_receipt_path(receipt)
    assert_response :success
    assert_match "Reading your receipt", response.body
    assert_match 'data-controller="poll"', response.body

    read!(receipt)
    get shared_receipt_path(receipt)
    assert_no_match 'data-controller="poll"', response.body
    assert_match "Nu. 500", response.body
    assert_match "BT26082911022", response.body
  end

  test "a read receipt pre-selects the shop whose account was paid" do
    sign_in_as @customer
    receipt = share
    ReceiptExtractionJob.new.perform(receipt.id, extractor: FakeExtractor.new)

    assert_equal @account, receipt.reload.matched_account
    assert_equal 50_000, receipt.amount_cents
    assert receipt.read?
  end

  test "confirming turns the receipt into an ordinary pending proof" do
    sign_in_as @customer
    receipt = share
    read!(receipt)

    assert_difference [ -> { PaymentProof.count }, -> { @owner.notifications.count } ], 1 do
      post confirm_shared_receipt_path(receipt), params: {
        account_id: @account.id, amount: "500", reference: "BT26082911022"
      }
    end

    assert_redirected_to account_path(@account)
    proof = PaymentProof.last
    assert proof.pending?, "the shop still has to confirm it (BR-30)"
    assert_equal 50_000, proof.amount_cents
    assert_equal @customer, proof.submitted_by
    assert proof.screenshot.attached?, "the shop needs to see the receipt"
    assert_equal 100_000, @account.reload.balance_cents, "a proof moves no balance (BR-29)"
    assert_equal proof, receipt.reload.payment_proof
  end

  test "confirming without choosing a shop asks rather than picking one" do
    sign_in_as @customer
    receipt = share
    read!(receipt)

    assert_no_difference -> { PaymentProof.count } do
      post confirm_shared_receipt_path(receipt), params: { amount: "500" }
    end
    assert_redirected_to receipt
  end

  test "a receipt cannot be aimed at someone else's account" do
    other_customer = create_customer(email: "someone@example.bt")
    other_account = create_account(@shop, name: "Not Yours", customer: other_customer)
    sign_in_as @customer
    receipt = share
    read!(receipt)

    assert_no_difference -> { PaymentProof.count } do
      post confirm_shared_receipt_path(receipt), params: { account_id: other_account.id, amount: "500" }
    end
    assert_redirected_to receipt
  end

  test "one customer cannot open another's receipt" do
    sign_in_as @customer
    receipt = share

    sign_in_as create_customer(email: "nosy@example.bt")
    get shared_receipt_path(receipt)
    assert_response :not_found
  end

  test "an unreadable receipt still gets a usable form" do
    sign_in_as @customer
    receipt = share
    receipt.update!(status: :unreadable, failure_reason: "The picture is too blurred to read.")

    get shared_receipt_path(receipt)
    assert_response :success
    assert_match "too blurred", response.body
    assert_match "Send proof to the shop", response.body, "they must still be able to send it by hand"
  end

  test "a customer with no accounts is told why the receipt cannot go anywhere" do
    lone = create_customer(email: "lone@example.bt")
    sign_in_as lone
    post shared_receipts_path, params: { receipt: screenshot_upload }
    read!(SharedReceipt.last)

    get shared_receipt_path(SharedReceipt.last)
    assert_match "no credit accounts yet", response.body
  end

  private
    def share
      post shared_receipts_path, params: { receipt: screenshot_upload }
      SharedReceipt.last
    end

    def read!(receipt)
      ReceiptExtractionJob.new.perform(receipt.id, extractor: FakeExtractor.new)
      receipt.reload
    end

    class FakeExtractor
      def call(_blob)
        ReceiptExtractor::Result.new(
          amount_cents: 50_000, recipient_name: "Karma Dorji", recipient_account: "····8901",
          sender_name: "Dawa Tashi", reference: "BT26082911022", paid_at: Time.current,
          bank_name: "Bank of Bhutan", confidence: "high", payment_receipt: true, raw: {}
        )
      end
    end
end
