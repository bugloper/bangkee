require "test_helper"

# SRS §16 — a proof never moves the balance until the owner confirms it.
class SettlementTest < ActiveSupport::TestCase
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @customer = create_customer
    @account = create_account(@shop, customer: @customer)
    record_credit(@account, amount_cents: 100_000, by: @owner)
  end

  test "a shop keeps at most one primary bank account (BR-27)" do
    first  = @shop.bank_accounts.create!(bank_name: "BoB", account_name: "Karma", account_number: "1", primary: true)
    second = @shop.bank_accounts.create!(bank_name: "BNB", account_name: "Karma", account_number: "2", primary: true)

    assert_not first.reload.primary?
    assert second.reload.primary?
  end

  test "bank details require a name and a number" do
    assert_not @shop.bank_accounts.new(bank_name: "BoB").valid?
  end

  test "a pending proof leaves the balance alone (BR-29)" do
    proof = build_proof
    assert proof.save
    assert proof.pending?
    assert_equal 100_000, @account.reload.balance_cents
  end

  test "a proof needs a screenshot and a positive amount (BR-28)" do
    proof = @account.payment_proofs.new(amount_cents: 50_000, submitted_by: @customer)
    assert_not proof.valid?, "no screenshot"
    assert_includes proof.errors[:screenshot].join, "attached"

    proof.screenshot.attach(io: File.open(screenshot_path), filename: "s.png", content_type: "image/png")
    proof.amount_cents = 0
    assert_not proof.valid?
  end

  test "a screenshot of the wrong type is refused" do
    proof = @account.payment_proofs.new(amount_cents: 1000, submitted_by: @customer)
    proof.screenshot.attach(io: StringIO.new("not an image"), filename: "notes.txt", content_type: "text/plain")
    assert_not proof.valid?
    assert_includes proof.errors[:screenshot].join, "PNG"
  end

  test "confirming records a payment, links it, and drops the balance (BR-30)" do
    proof = build_proof(amount_cents: 40_000)
    proof.save!

    assert_difference -> { @account.transactions.count }, 1 do
      assert proof.confirm!(by: @owner)
    end

    proof.reload
    assert proof.confirmed?
    assert_equal @owner, proof.reviewed_by
    assert proof.payment_transaction.payment?
    assert_equal 40_000, proof.payment_transaction.amount_cents
    assert_equal 60_000, @account.reload.balance_cents
  end

  test "rejecting changes nothing but the record (BR-31)" do
    proof = build_proof
    proof.save!

    assert_no_difference -> { @account.transactions.count } do
      assert proof.reject!(by: @owner, reason: "Amount does not match")
    end

    assert proof.reload.rejected?
    assert_equal "Amount does not match", proof.rejection_reason
    assert_equal 100_000, @account.reload.balance_cents
  end

  test "a reviewed proof cannot be reviewed again (BR-32)" do
    proof = build_proof
    proof.save!
    assert proof.confirm!(by: @owner)

    assert_no_difference -> { @account.transactions.count } do
      assert_not proof.confirm!(by: @owner)
      assert_not proof.reject!(by: @owner, reason: "too late")
    end
  end

  private
    def build_proof(amount_cents: 50_000)
      proof = @account.payment_proofs.new(amount_cents: amount_cents, submitted_by: @customer,
                                          reference: "BT26082911022")
      proof.screenshot.attach(io: File.open(screenshot_path), filename: "proof.png", content_type: "image/png")
      proof
    end
end
