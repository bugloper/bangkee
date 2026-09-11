require "test_helper"

# An evening at a restaurant table, through the screens.
class TabFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @account = create_account(@shop, name: "Dorji")
    sign_in_as @owner
  end

  test "every tab screen renders" do
    tab = open_tab
    order tab, "Beer", unit_price: "120"

    [ tabs_path, new_tab_path, tab_path(tab) ].each do |path|
      get path
      assert_response :success, "GET #{path} failed"
    end
  end

  test "opening a tab, ordering through the evening, then paying cash" do
    post tabs_path, params: { tab: { label: "Table 4" } }
    tab = Tab.last
    assert_redirected_to tab
    assert_equal @owner, tab.opened_by

    order tab, "Beer", quantity: "2", unit_price: "120"
    order tab, "Chicken fried rice", unit_price: "250"
    assert_equal 49_000, tab.reload.total_cents

    get tab_path(tab)
    assert_match "Chicken fried rice", response.body
    assert_match "Nu. 490", response.body

    assert_no_difference -> { Transaction.count } do
      post settle_tab_path(tab), params: { settlement: "paid", payment_method: "Cash" }
    end

    assert_redirected_to tabs_path
    assert tab.reload.settlement_paid?
    assert_equal 0, @account.reload.balance_cents
  end

  test "settling onto the book raises the credit and tells the customer" do
    customer = create_customer
    @account.update!(customer: customer)
    tab = open_tab
    order tab, "Beer", quantity: "2", unit_price: "120"

    assert_difference [ -> { Transaction.count }, -> { customer.notifications.count } ], 1 do
      post settle_tab_path(tab), params: { settlement: "credited", account_id: @account.id }
    end

    assert_redirected_to account_path(@account)
    assert_equal 24_000, @account.reload.balance_cents

    # And it reads as an itemised credit on their page, like any other.
    get account_path(@account)
    assert_match "Table 4", response.body
    assert_match "1 item", response.body
  end

  test "settling onto the book needs a customer, and refuses one from another shop" do
    tab = open_tab
    order tab, "Beer", unit_price: "120"
    stranger = create_account(create_owner(email: "other@shop.bt").shop, name: "Not Ours")

    assert_no_difference -> { Transaction.count } do
      post settle_tab_path(tab), params: { settlement: "credited" }
      assert_redirected_to tab

      post settle_tab_path(tab), params: { settlement: "credited", account_id: stranger.id }
      assert_redirected_to tab
    end
    assert tab.reload.open?
  end

  test "a tab cannot be opened against another shop's customer" do
    stranger = create_account(create_owner(email: "other@shop.bt").shop, name: "Not Ours")

    post tabs_path, params: { tab: { label: "Table 9", account_id: stranger.id } }

    assert_nil Tab.last.account, "an id from the form cannot name someone else's customer"
    assert_equal "Table 9", Tab.last.label
  end

  test "an item ordered by mistake comes straight off" do
    tab = open_tab
    item = order tab, "Beer", unit_price: "120"
    order tab, "Momo", unit_price: "80"

    assert_difference -> { TabItem.count }, -1 do
      delete tab_item_path(tab, item)
    end
    assert_equal 8_000, tab.reload.total_cents
  end

  test "an empty tab cannot be settled" do
    tab = open_tab

    post settle_tab_path(tab), params: { settlement: "paid" }
    assert_redirected_to tab
    assert tab.reload.open?
  end

  test "a tab closed without charging bills nobody" do
    tab = open_tab
    order tab, "Beer", unit_price: "120"

    assert_no_difference -> { Transaction.count } do
      delete void_tab_path(tab)
    end
    assert tab.reload.voided?
  end

  test "the shop's usual orders show up for one-tap adding" do
    first = open_tab
    3.times { order first, "Beer", unit_price: "120" }
    post settle_tab_path(first), params: { settlement: "paid", payment_method: "Cash" }

    second = open_tab(label: "Table 5")
    get tab_path(second)
    assert_match "Usual orders", response.body
    assert_match "Beer", response.body
  end

  test "another shop's owner cannot see or touch this tab" do
    tab = open_tab
    sign_in_as create_owner(email: "other@shop.bt")

    get tab_path(tab)
    assert_response :not_found

    post settle_tab_path(tab), params: { settlement: "paid" }
    assert_response :not_found
    assert tab.reload.open?
  end

  test "a customer has no business in the tabs screens at all" do
    tab = open_tab
    sign_in_as create_customer

    [ tabs_path, new_tab_path, tab_path(tab) ].each do |path|
      get path
      assert_redirected_to root_path
    end
  end

  test "a write-locked shop can read its tabs but not run them (BR-40)" do
    tab = open_tab
    order tab, "Beer", unit_price: "120"
    @shop.subscription.update!(current_period_end: 40.days.ago, grace_until: 26.days.ago)

    get tabs_path
    assert_response :success, "the owner keeps every read"

    assert_no_difference -> { TabItem.count } do
      post tab_items_path(tab), params: { tab_item: { name: "Beer", quantity: 1, unit_price: "120" } }
      assert_redirected_to subscription_path
    end

    post settle_tab_path(tab), params: { settlement: "paid" }
    assert_redirected_to subscription_path
    assert tab.reload.open?
  end

  private
    def open_tab(label: "Table 4")
      @shop.tabs.create!(label: label, opened_by: @owner)
    end

    def order(tab, name, quantity: "1", unit_price:)
      post tab_items_path(tab), params: { tab_item: { name: name, quantity: quantity, unit_price: unit_price } }
      tab.tab_items.order(:id).last
    end
end
