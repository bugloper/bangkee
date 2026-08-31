require "test_helper"

# The business rules from SRS §5 — these hold the ledger together.
class LedgerTest < ActiveSupport::TestCase
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @account = create_account(@shop)
  end

  test "money is stored as chetrum and read back as a major unit (BR-1, BR-2)" do
    transaction = @account.transactions.new(kind: :credit, created_by: @owner)
    transaction.amount = "12.50"
    assert_equal 1250, transaction.amount_cents
    assert_equal BigDecimal("12.5"), transaction.amount

    transaction.amount = "1,250"
    assert_equal 125_000, transaction.amount_cents

    transaction.amount = ""
    assert_nil transaction.amount_cents
  end

  test "balance is credits minus payments and positive means the customer owes (BR-5, BR-6)" do
    record_credit(@account,  amount_cents: 120_000, by: @owner)
    record_payment(@account, amount_cents: 50_000,  by: @owner)

    assert_equal 70_000, @account.reload.balance_cents
    assert_not @account.settled?
    assert_not @account.in_credit?
  end

  test "paying more than owed puts the account in credit (BR-5, BR-34)" do
    record_credit(@account,  amount_cents: 10_000, by: @owner)
    record_payment(@account, amount_cents: 30_000, by: @owner)

    assert_equal(-20_000, @account.reload.balance_cents)
    assert @account.in_credit?
  end

  test "last_activity_at tracks the newest active transaction (BR-8)" do
    record_credit(@account, amount_cents: 1000, by: @owner, occurred_at: 5.days.ago)
    newest = record_credit(@account, amount_cents: 1000, by: @owner, occurred_at: 1.day.ago)

    assert_in_delta newest.occurred_at, @account.reload.last_activity_at, 1.second
  end

  test "an itemized credit takes its amount from its line items (BR-12, BR-13)" do
    purchase = @account.transactions.new(kind: :credit, itemized: true, created_by: @owner, amount_cents: 1)
    purchase.line_items.build(name: "Rice 25 kg", quantity: 1, unit_price_cents: 62_000)
    purchase.line_items.build(name: "Oil 1 L", quantity: 2, unit_price_cents: 9_500)
    purchase.save!

    assert_equal 81_000, purchase.reload.amount_cents
    assert_equal 19_000, purchase.line_items.find_by(name: "Oil 1 L").total_cents
  end

  test "an amount of zero or less is refused" do
    transaction = @account.transactions.new(kind: :credit, amount_cents: 0, created_by: @owner)
    assert_not transaction.valid?
    assert_includes transaction.errors[:amount_cents].join, "greater than 0"
  end

  test "voiding keeps the record, leaves the balance, and writes an audit event (BR-11, BR-15, BR-16)" do
    transaction = record_credit(@account, amount_cents: 40_000, by: @owner)
    assert_equal 40_000, @account.reload.balance_cents

    assert_difference -> { AuditEvent.count }, 1 do
      assert transaction.void!(by: @owner)
    end

    assert transaction.reload.voided?
    assert_equal @owner, transaction.voided_by
    assert_equal 0, @account.reload.balance_cents
    assert_equal Transaction.count, Transaction.unscoped.count, "the row must not be deleted"
    assert_equal "voided", transaction.audit_events.last.action
  end

  test "voiding twice is a no-op (BR-15)" do
    transaction = record_credit(@account, amount_cents: 1000, by: @owner)
    assert transaction.void!(by: @owner)
    assert_not transaction.void!(by: @owner)
  end

  test "the ledger is chronological with a running balance and excludes voided rows (BR-10, BR-11)" do
    record_credit(@account,  amount_cents: 100_000, by: @owner, occurred_at: 3.days.ago)
    record_payment(@account, amount_cents: 40_000,  by: @owner, occurred_at: 2.days.ago)
    voided = record_credit(@account, amount_cents: 5_000, by: @owner, occurred_at: 1.day.ago)
    voided.void!(by: @owner)

    running = @account.ledger.map(&:last)
    assert_equal [ 100_000, 60_000 ], running
  end

  test "an account is overdue only when it owes and has gone quiet (BR-19, BR-21)" do
    record_credit(@account, amount_cents: 50_000, by: @owner, occurred_at: 45.days.ago)
    assert @account.reload.overdue?
    assert_includes @shop.overdue_accounts, @account

    record_payment(@account, amount_cents: 50_000, by: @owner)
    assert_not @account.reload.overdue?, "a settled account is never overdue"
  end

  test "credit_due_days must be positive (BR-20)" do
    @shop.credit_due_days = 0
    assert_not @shop.valid?
  end

  test "an account is claimed by exactly one customer (BR-22, BR-24, BR-25)" do
    customer = create_customer
    assert_not @account.joined?

    assert @account.claim!(customer)
    assert @account.reload.joined?
    assert_equal "customer_joined", @account.audit_events.last.action

    assert_not @account.claim!(create_customer(email: "other@example.bt")),
      "an already-claimed account cannot be re-claimed"
  end
end
