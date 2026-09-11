require "test_helper"

# Scanning a table card, ordering from a phone, and the counter dealing with it.
# The public half of this is the only surface in Bangkee an unknown person can
# reach, so most of what is here is about what they cannot do.
class ScanToOrderFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @table = @shop.shop_tables.create!(name: "Table 4")
    @beer = @shop.menu_items.create!(name: "Beer", price_cents: 12_000, category: "Drinks")
    @rice = @shop.menu_items.create!(name: "Chicken fried rice", price_cents: 25_000, category: "Food")
  end

  # ------------------------------------------------------------ the customer
  test "scanning a card shows the shop's menu without signing in" do
    get table_menu_path(@table.token)

    assert_response :success
    assert_match @shop.name, response.body
    assert_match "Table 4", response.body
    assert_match "Beer", response.body
    assert_match "Chicken fried rice", response.body
    assert_no_match "Sign out", response.body, "a diner is not a Bangkee user"
  end

  test "an item that is off the menu today cannot be seen or ordered" do
    @beer.update!(available: false)

    get table_menu_path(@table.token)
    assert_no_match "Beer", response.body

    assert_no_difference -> { TableOrder.count } do
      post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 2 } }
    end
  end

  test "a card that has been retired stops working" do
    @table.update!(active: false)

    get table_menu_path(@table.token)
    assert_redirected_to root_path
  end

  test "an unknown code is refused" do
    get table_menu_path("not-a-real-token")
    assert_redirected_to root_path
  end

  test "placing an order sends it to the counter and tells the owner" do
    assert_difference [ -> { TableOrder.count }, -> { @owner.notifications.count } ], 1 do
      post table_menu_orders_path(@table.token), params: {
        quantities: { @beer.id => 2, @rice.id => 1 }, note: "no chilli"
      }
    end

    order = TableOrder.last
    assert_redirected_to table_menu_order_path(@table.token, order)
    assert order.pending?
    assert_equal 49_000, order.total_cents
    assert_equal "no chilli", order.note
    assert_equal [ "Beer", "Chicken fried rice" ], order.table_order_items.order(:id).map(&:name)
  end

  test "an order is not money owed until the counter accepts it" do
    post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 2 } }

    assert_nil @table.reload.open_tab, "no tab is opened by ordering alone"
    assert_equal 0, @shop.tabs.count
    assert_equal 0, TabItem.count
  end

  test "prices come from the menu, never from the form" do
    post table_menu_orders_path(@table.token), params: {
      quantities: { @beer.id => 1 },
      # A customer editing the page cannot talk the shop into a cheaper beer.
      prices: { @beer.id => "1" }, unit_price: "1", total_cents: "1"
    }

    assert_equal 12_000, TableOrder.last.total_cents
  end

  test "an order cannot reach through a card to another shop's menu" do
    other = create_owner(email: "other@shop.bt").shop
    theirs = other.menu_items.create!(name: "Momo", price_cents: 8_000)

    post table_menu_orders_path(@table.token), params: { quantities: { theirs.id => 3 } }

    assert_equal 0, TableOrder.count, "nothing orderable was named"
  end

  test "an empty order is refused" do
    assert_no_difference -> { TableOrder.count } do
      post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 0 } }
    end
    assert_redirected_to table_menu_path(@table.token)
  end

  test "a wild quantity is capped rather than accepted" do
    post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 9_999 } }

    assert_equal 50, TableOrder.last.table_order_items.sole.quantity.to_i
  end

  test "the customer can see what happened to their order" do
    post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 1 } }
    order = TableOrder.last

    get table_menu_order_path(@table.token, order)
    assert_response :success
    assert_match "Sent to the counter", response.body

    order.accept!(by: @owner)
    get table_menu_order_path(@table.token, order)
    assert_match "Accepted", response.body
  end

  # --------------------------------------------------------------- the counter
  test "accepting an order opens a tab for the table and puts the lines on it" do
    post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 2, @rice.id => 1 } }
    order = TableOrder.last
    sign_in_as @owner

    get orders_path
    assert_response :success
    assert_match "Table 4", response.body
    assert_match "Nu. 490", response.body

    assert_difference -> { Tab.count }, 1 do
      post accept_order_path(order)
    end

    tab = @table.reload.open_tab
    assert_equal "Table 4", tab.label
    assert_equal 49_000, tab.total_cents
    assert_equal [ "Beer", "Chicken fried rice" ], tab.tab_items.order(:id).map(&:name)
    assert order.reload.accepted?
    assert_equal tab, order.tab
  end

  test "a second order joins the tab already running on that table" do
    tab = @shop.tabs.create!(label: "Table 4", shop_table: @table, opened_by: @owner)
    sign_in_as @owner

    post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 1 } }
    assert_no_difference -> { Tab.count } do
      post accept_order_path(TableOrder.last)
    end

    assert_equal 12_000, tab.reload.total_cents
  end

  test "turning an order down charges nobody and tells the customer why" do
    post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 1 } }
    order = TableOrder.last
    sign_in_as @owner

    assert_no_difference [ -> { Tab.count }, -> { TabItem.count } ] do
      post reject_order_path(order), params: { rejection_reason: "kitchen is closed" }
    end

    assert order.reload.rejected?
    assert_equal "kitchen is closed", order.rejection_reason
  end

  test "an order cannot be dealt with twice" do
    post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 1 } }
    order = TableOrder.last
    sign_in_as @owner
    post accept_order_path(order)

    assert_no_difference -> { TabItem.count } do
      post accept_order_path(order)
      post reject_order_path(order)
    end
  end

  test "another shop's owner cannot see or accept these orders" do
    post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 1 } }
    order = TableOrder.last
    sign_in_as create_owner(email: "other@shop.bt")

    get orders_path
    assert_response :success
    assert_no_match "Table 4", response.body

    post accept_order_path(order)
    assert_response :not_found
    assert order.reload.pending?
  end

  test "a customer cannot reach the counter" do
    sign_in_as create_customer

    get orders_path
    assert_redirected_to root_path
  end

  test "a write-locked shop still takes orders but cannot accept them (BR-40)" do
    @shop.subscription.update!(current_period_end: 40.days.ago, grace_until: 26.days.ago)

    # The customer is not the one who owes Bangkee money.
    assert_difference -> { TableOrder.count }, 1 do
      post table_menu_orders_path(@table.token), params: { quantities: { @beer.id => 1 } }
    end

    sign_in_as @owner
    get orders_path
    assert_response :success, "the counter stays readable"

    assert_no_difference -> { TabItem.count } do
      post accept_order_path(TableOrder.last)
    end
    assert_redirected_to subscription_path
  end

  # ------------------------------------------------------------- the QR cards
  test "the printable cards carry one QR per table" do
    @shop.shop_tables.create!(name: "Table 5")
    sign_in_as @owner

    get cards_shop_tables_path
    assert_response :success
    codes = Nokogiri::HTML(response.body).css("svg[aria-label='QR code']")
    assert_equal 2, codes.size, "one code per table"
    assert_match "Table 4", response.body
    assert_match "Table 5", response.body
  end

  test "a table's own screen shows the link its code encodes" do
    sign_in_as @owner

    get edit_shop_table_path(@table)
    assert_response :success
    # Printed in full so it can be typed or checked by hand if a camera fails.
    assert_match table_menu_url(@table.token), response.body
  end

  test "a table's token is unguessable and unique" do
    assert_operator @table.token.length, :>=, 20
    assert_not_equal @table.token, @shop.shop_tables.create!(name: "Table 6").token
  end
end
