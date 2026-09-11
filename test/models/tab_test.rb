require "test_helper"

# A running bill. The rule that matters: an open tab is not a balance, and
# settling it takes exactly one of two roads.
class TabTest < ActiveSupport::TestCase
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @account = create_account(@shop, name: "Dorji")
    @tab = @shop.tabs.create!(label: "Table 4", opened_by: @owner)
  end

  test "the running total follows the items on and off" do
    add "Beer", quantity: 2, unit_price_cents: 12_000
    assert_equal 24_000, @tab.reload.total_cents

    item = add "Chicken fried rice", unit_price_cents: 25_000
    assert_equal 49_000, @tab.reload.total_cents

    item.destroy
    assert_equal 24_000, @tab.reload.total_cents
  end

  test "the total counts every line, including ones added in the same breath" do
    # Adding several items in one go is the normal case when an order is
    # accepted onto a tab, and a cached association can miss the last one.
    [ [ "Beer", 12_000 ], [ "Momo", 8_000 ], [ "Ema datshi", 18_000 ] ].each do |name, price|
      @tab.tab_items.create!(name: name, quantity: 1, unit_price_cents: price, added_by: @owner)
    end

    assert_equal 38_000, @tab.reload.total_cents
  end

  test "a fractional quantity is rounded the way a line item is" do
    add "Snooker", quantity: 1.5, unit_price_cents: 20_000
    assert_equal 30_000, @tab.reload.total_cents
  end

  test "an open tab owes nothing — it is not on anyone's book yet" do
    add "Beer", quantity: 3, unit_price_cents: 12_000

    assert_equal 0, @account.reload.balance_cents
    assert_equal 0, @shop.transactions.count
    assert @tab.open?
  end

  test "paid at the table settles it without touching the credit book" do
    add "Beer", quantity: 2, unit_price_cents: 12_000

    assert_no_difference -> { Transaction.count } do
      assert @tab.settle_paid!(by: @owner, method: "Cash")
    end

    @tab.reload
    assert @tab.settled?
    assert @tab.settlement_paid?
    assert_equal "Cash", @tab.payment_method
    assert_equal @owner, @tab.settled_by
    assert_equal 0, @account.reload.balance_cents, "nothing was ever owed"
    assert_equal "settled_paid", @tab.audit_events.last.action
  end

  test "putting it on the book raises one itemized credit carrying every line" do
    add "Beer", quantity: 2, unit_price_cents: 12_000
    add "Chicken fried rice", unit_price_cents: 25_000

    assert_difference -> { @account.transactions.count }, 1 do
      assert @tab.settle_on_credit!(by: @owner, account: @account)
    end

    credit = @tab.reload.settlement_transaction
    assert credit.credit?
    assert credit.itemized?
    assert_equal 49_000, credit.amount_cents
    assert_equal 49_000, @account.reload.balance_cents
    assert_equal [ "Beer", "Chicken fried rice" ], credit.line_items.order(:id).map(&:name)
    assert_equal 24_000, credit.line_items.find_by(name: "Beer").total_cents
    assert @tab.settlement_credited?
    assert_equal @account, @tab.account
  end

  test "part paid raises both entries, so the page shows what was taken and what was handed over" do
    add "Beer", quantity: 2, unit_price_cents: 12_000
    add "Chicken fried rice", unit_price_cents: 25_000   # 49,000 in all

    assert_difference -> { @account.transactions.count }, 2 do
      assert @tab.settle_part_paid!(by: @owner, account: @account, paid_cents: 20_000, method: "Cash")
    end

    @tab.reload
    assert @tab.settlement_part_paid?
    assert_equal 20_000, @tab.paid_cents
    assert_equal 29_000, @tab.credited_cents
    assert_equal 29_000, @account.reload.balance_cents, "they still owe the difference"

    credit = @tab.settlement_transaction
    assert_equal 49_000, credit.amount_cents, "the credit is the whole bill, not the remainder"
    assert_equal 2, credit.line_items.count
    payment = @account.transactions.payment.sole
    assert_equal 20_000, payment.amount_cents
    assert_equal "Cash", payment.payment_method
  end

  test "part paying the whole bill, or none of it, is refused" do
    add "Beer", unit_price_cents: 12_000

    assert_no_difference -> { @account.transactions.count } do
      assert_not @tab.settle_part_paid!(by: @owner, account: @account, paid_cents: 12_000)
      assert_not @tab.settle_part_paid!(by: @owner, account: @account, paid_cents: 20_000)
      assert_not @tab.settle_part_paid!(by: @owner, account: @account, paid_cents: 0)
    end
    assert @tab.reload.open?
  end

  test "a part paid tab cannot be settled again, and refuses another shop's customer" do
    add "Beer", unit_price_cents: 12_000
    stranger = create_account(create_owner(email: "other@shop.bt").shop, name: "Not Ours")

    assert_not @tab.settle_part_paid!(by: @owner, account: stranger, paid_cents: 5_000)

    assert @tab.settle_part_paid!(by: @owner, account: @account, paid_cents: 5_000)
    assert_not @tab.settle_part_paid!(by: @owner, account: @account, paid_cents: 1_000)
    assert_not @tab.settle_paid!(by: @owner)
  end

  test "a fully paid tab records that the whole bill was handed over" do
    add "Beer", unit_price_cents: 12_000
    @tab.settle_paid!(by: @owner, method: "Cash")

    assert_equal 12_000, @tab.reload.paid_cents
    assert_equal 0, @tab.credited_cents
  end

  test "a tab put on the book can be voided like any other credit" do
    add "Beer", unit_price_cents: 12_000
    @tab.settle_on_credit!(by: @owner, account: @account)

    assert @tab.reload.settlement_transaction.void!(by: @owner)
    assert_equal 0, @account.reload.balance_cents, "voiding the credit unwinds the tab's effect"
  end

  test "an empty tab cannot be settled either way" do
    assert_not @tab.settle_paid!(by: @owner)
    assert_not @tab.settle_on_credit!(by: @owner, account: @account)
    assert @tab.reload.open?
  end

  test "a settled tab cannot be settled again" do
    add "Beer", unit_price_cents: 12_000
    assert @tab.settle_paid!(by: @owner, method: "Cash")

    assert_no_difference -> { Transaction.count } do
      assert_not @tab.settle_paid!(by: @owner)
      assert_not @tab.settle_on_credit!(by: @owner, account: @account)
    end
  end

  test "a tab cannot be put on an account at another shop" do
    stranger = create_account(create_owner(email: "other@shop.bt").shop, name: "Not Ours")
    add "Beer", unit_price_cents: 12_000

    assert_no_difference -> { Transaction.count } do
      assert_not @tab.settle_on_credit!(by: @owner, account: stranger)
    end
    assert @tab.reload.open?
  end

  test "a tab opened by mistake closes without charging anyone" do
    add "Beer", unit_price_cents: 12_000

    assert_no_difference -> { Transaction.count } do
      assert @tab.void!(by: @owner)
    end

    assert @tab.reload.voided?
    assert_equal 0, @account.reload.balance_cents
    assert_equal "voided", @tab.audit_events.last.action
  end

  test "removing a settled-up customer does not trip over the tab that paid them off" do
    add "Beer", unit_price_cents: 12_000
    @tab.settle_on_credit!(by: @owner, account: @account)
    # They settle up, so the account is removable per AccountsController.
    record_payment(@account, amount_cents: 12_000, by: @owner)
    assert_equal 0, @account.reload.balance_cents

    assert_nothing_raised { @account.destroy }
    assert_nil @tab.reload.transaction_id, "the sale stays on record; the link to the deleted credit goes"
  end

  test "a tab needs a label to be worth anything" do
    assert_not @shop.tabs.new(opened_by: @owner).valid?
  end

  test "an item needs a name, a real quantity and a price that is not negative" do
    assert_not @tab.tab_items.new(added_by: @owner, unit_price_cents: 100).valid?
    assert_not @tab.tab_items.new(name: "Beer", added_by: @owner, quantity: 0).valid?
    assert_not @tab.tab_items.new(name: "Beer", added_by: @owner, unit_price_cents: -1).valid?
  end

  test "the shop learns its usual orders from what it has actually sold" do
    3.times { add "Beer", unit_price_cents: 12_000 }
    add "Beer", unit_price_cents: 13_000   # the price went up
    add "Momo", unit_price_cents: 8_000

    usual = @shop.frequent_tab_items

    assert_equal [ "Beer", "Momo" ], usual.map(&:name), "most ordered first"
    assert_equal 13_000, usual.first.unit_price_cents, "at the price it last went out at"
  end

  test "one shop's usual orders are not another's" do
    add "Beer", unit_price_cents: 12_000
    other = create_owner(email: "other@shop.bt").shop

    assert_empty other.frequent_tab_items
  end

  private
    def add(name, quantity: 1, unit_price_cents: 0)
      @tab.tab_items.create!(name: name, quantity: quantity,
                             unit_price_cents: unit_price_cents, added_by: @owner)
    end
end
