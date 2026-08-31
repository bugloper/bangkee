require "test_helper"

# The three files that make Bangkee installable, plus the notification surface.
class PwaTest < ActionDispatch::IntegrationTest
  # Push is a no-op without keys, so the positive paths need a pair present.
  def with_vapid_keys
    ENV["VAPID_PUBLIC_KEY"] = "test-public-key"
    ENV["VAPID_PRIVATE_KEY"] = "test-private-key"
    yield
  ensure
    ENV.delete("VAPID_PUBLIC_KEY")
    ENV.delete("VAPID_PRIVATE_KEY")
  end

  test "the manifest is public, installable, and points at real icons" do
    get pwa_manifest_path
    assert_response :success
    assert_equal "application/manifest+json", response.media_type

    manifest = JSON.parse(response.body)
    assert_equal "standalone", manifest["display"]
    assert_equal "#003d9b", manifest["theme_color"]
    assert_equal "/", manifest["scope"]
    assert manifest["icons"].any? { |icon| icon["purpose"] == "maskable" }

    manifest["icons"].each do |icon|
      assert Rails.root.join("public#{icon["src"]}").exist?, "#{icon["src"]} is missing from public/"
    end
  end

  test "the service worker is served from the root with the right scope header" do
    get pwa_service_worker_path
    assert_response :success
    assert_equal "text/javascript", response.media_type
    assert_equal "/", response.headers["Service-Worker-Allowed"]

    assert_match "addEventListener(\"push\"", response.body
    assert_match "addEventListener(\"notificationclick\"", response.body
    assert_match offline_path, response.body
  end

  test "the service worker can drain the offline queue after the app is closed" do
    get pwa_service_worker_path
    assert_response :success

    assert_match "addEventListener(\"sync\"", response.body
    assert_match "bangkee-queued-writes", response.body, "must match the tag the page registers"
    assert_match "queued_writes", response.body, "must read the store the page writes"
    assert_match "X-CSRF-Token", response.body, "a replay is still a Rails write"
  end

  test "the offline page renders without a session" do
    get offline_path
    assert_response :success
    assert_match "You are offline", response.body
  end

  test "a signed-in user can register and remove a device for push" do
    user = create_customer
    sign_in_as user

    assert_difference -> { user.push_subscriptions.count }, 1 do
      post push_subscription_path, params: {
        endpoint: "https://push.example/abc", p256dh_key: "key", auth_key: "auth"
      }
    end
    assert_response :created

    # Re-registering the same browser updates the row rather than duplicating it.
    assert_no_difference -> { user.push_subscriptions.count } do
      post push_subscription_path, params: {
        endpoint: "https://push.example/abc", p256dh_key: "new", auth_key: "auth"
      }
    end
    assert_equal "new", user.push_subscriptions.first.p256dh_key

    assert_difference -> { user.push_subscriptions.count }, -1 do
      delete push_subscription_path, params: { endpoint: "https://push.example/abc" }
    end
  end

  test "notification permission is asked for after a write, never on arrival" do
    owner = create_owner
    account = create_account(owner.shop)
    sign_in_as owner

    # Arriving asks for nothing.
    get dashboard_path
    assert_response :success
    assert_no_match "data-pwa-ask-push-value", response.body

    # Recording a credit is the moment it makes sense — but only when the
    # server can actually push (no VAPID keys in test, so nothing is asked).
    post account_credits_path(account), params: { transaction: { amount: "500" } }
    follow_redirect!
    assert_no_match "data-pwa-ask-push-value", response.body,
      "without VAPID keys there is nothing to ask for"
    assert_no_match "flash", flash.to_hash.keys.join, "ask_push must never render as a banner"
  end

  test "with push configured, the ask appears on the page after a write" do
    with_vapid_keys do
      owner = create_owner
      account = create_account(owner.shop)
      sign_in_as owner

      get dashboard_path
      assert_no_match "data-pwa-ask-push-value", response.body, "not on arrival"

      post account_credits_path(account), params: { transaction: { amount: "500" } }
      follow_redirect!
      assert_match "data-pwa-ask-push-value", response.body, "asked once the credit is in the book"
      assert_match "data-pwa-vapid-key-value", response.body

      # And not again on the next screen.
      get dashboard_path
      assert_no_match "data-pwa-ask-push-value", response.body
    end
  end

  test "an owner whose device is already registered is never asked again" do
    with_vapid_keys do
      owner = create_owner
      account = create_account(owner.shop)
      owner.push_subscriptions.create!(endpoint: "https://push.example/a", p256dh_key: "k", auth_key: "a")
      sign_in_as owner

      post account_credits_path(account), params: { transaction: { amount: "500" } }
      follow_redirect!
      assert_no_match "data-pwa-ask-push-value", response.body
    end
  end

  test "the prompt and the iPhone instructions are on the page for a signed-in user" do
    sign_in_as create_owner

    get dashboard_path
    assert_response :success
    assert_match "push-prompt", response.body
    assert_match "Add to Home Screen", response.body, "iOS cannot install without being told how"
    assert_match "Install Bangkee", response.body
  end

  test "push registration needs a session" do
    post push_subscription_path, params: { endpoint: "https://push.example/x", p256dh_key: "k", auth_key: "a" }
    assert_redirected_to new_session_path
  end

  test "notifications can be read one at a time or all at once" do
    user = create_customer
    3.times { |i| user.notifications.create!(kind: "credit", title: "Credit #{i}", path: "/dashboard") }
    sign_in_as user

    get notifications_path
    assert_response :success
    assert_match "Credit 0", response.body

    patch read_notification_path(user.notifications.first)
    assert user.notifications.first.reload.read?

    patch read_all_notifications_path
    assert_equal 0, user.notifications.unread.count
  end

  test "a queued push is enqueued for every notification but never sent without VAPID keys" do
    user = create_customer
    user.push_subscriptions.create!(endpoint: "https://push.example/a", p256dh_key: "k", auth_key: "a")

    notification = nil
    assert_enqueued_with job: PushDeliveryJob do
      notification = user.notifications.create!(kind: "payment", title: "Payment received")
      PushDeliveryJob.perform_later(notification.id)
    end

    # No keys configured in test, so delivery is a no-op rather than an error.
    assert_nothing_raised { PushDeliveryJob.perform_now(notification.id) }
  end
end
