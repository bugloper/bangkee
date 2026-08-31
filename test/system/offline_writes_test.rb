require "application_system_test_case"

class OfflineWritesTest < ApplicationSystemTestCase
  setup do
    skip "no Chromium-based browser on this machine" unless self.class.browser_available?

    @owner = create_owner(email: "karma@shop.bt")
    @account = create_account(@owner.shop, name: "Tashi Wangmo")
    sign_in @owner
  end

  test "a credit recorded with no signal is queued on the device and sent when the signal returns" do
    visit new_account_credit_path(@account)
    fill_in "Amount in Ngultrum", with: "1250"
    fill_in "What was taken", with: "Groceries"

    go_offline
    click_on "Save credit"

    # Back on the account, with the entry visibly held on the phone.
    assert_text "Waiting to send"
    assert_text "Nu. 1,250"
    assert_text "Groceries"
    assert_equal 0, @account.reload.transactions.count, "nothing reached the server yet"

    go_online
    click_on "Try sending now"

    assert_no_text "Waiting to send", wait: 10
    assert_equal 1, @account.reload.transactions.count
    assert_equal 125_000, @account.balance_cents
  end

  test "an entry stays queued across a reload while still offline" do
    visit new_account_payment_path(@account)
    fill_in "Amount in Ngultrum", with: "500"

    go_offline
    click_on "Save payment"
    assert_text "Waiting to send"

    go_online
    visit account_path(@account)   # a fresh page reads the queue back from IndexedDB
    assert_text "Nu. 500"
  end

  test "the offline banner appears the moment the connection drops" do
    visit dashboard_path
    assert_no_text "You are offline"

    go_offline
    assert_text "You are offline"

    go_online
    assert_no_text "You are offline"
  end
end
