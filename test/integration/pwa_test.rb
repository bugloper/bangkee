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

  test "two money events in a row each alert, rather than one silently replacing the other" do
    with_vapid_keys do
      user = create_customer
      user.push_subscriptions.create!(endpoint: "https://push.example/a", p256dh_key: "k", auth_key: "a")

      first = user.notifications.create!(kind: "payment", title: "Payment recorded", body: "Nu. 500")
      second = user.notifications.create!(kind: "payment", title: "Payment recorded", body: "Nu. 800")
      [ first, second ].each { |notification| PushDeliveryJob.perform_now(notification.id) }

      tags = Rpush::Webpush::Notification.order(:id).last(2).map { |push| JSON.parse(push.data["message"])["tag"] }
      assert_equal 2, tags.uniq.size, "distinct payments must not share a tag"
    end
  end

  test "a reminder that repeats about the same account collapses instead of stacking" do
    with_vapid_keys do
      owner = create_owner
      account = create_account(owner.shop)
      owner.push_subscriptions.create!(endpoint: "https://push.example/a", p256dh_key: "k", auth_key: "a")

      tags = 2.times.map do
        notification = owner.notifications.create!(kind: "overdue", title: "Overdue",
                                                   path: account_path(account))
        PushDeliveryJob.perform_now(notification.id)
        JSON.parse(Rpush::Webpush::Notification.order(:id).last.data["message"])["tag"]
      end

      assert_equal 1, tags.uniq.size, "yesterday's reminder is replaced, not stacked"
      assert_match "overdue", tags.first
    end
  end

  test "the push handler asks to alert again and to vibrate" do
    get pwa_service_worker_path
    assert_response :success

    # A PWA cannot set its own sound, so vibration is the only signal we shape.
    assert_match "renotify: true", response.body
    assert_match "vibrate:", response.body
    assert_match "VIBRATION", response.body
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

  # This is here because it broke: `hidden` is a user-agent rule, so the
  # author's `display: flex` on .sheet-backdrop / .viewer / .install won every
  # time and those elements were permanently on screen with no way to close.
  test "the stylesheet makes the hidden attribute actually hide things" do
    css = Rails.root.join("app/assets/stylesheets/application.css").read

    assert_match(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/, css,
      "every overlay in this app is display:flex — hidden must be forced")
  end

  test "each sheet has a target inside the controller that has to close it" do
    sign_in_as create_owner
    get dashboard_path
    assert_response :success

    document = Nokogiri::HTML(response.body)

    document.css("[data-controller~='sheet']").each do |scope|
      # Stimulus scopes a target to the nearest enclosing controller, so a sheet
      # whose target sits outside its own controller cannot be closed — the
      # action throws on a missing target.
      own_targets = scope.css("[data-sheet-target='sheet']").reject do |target|
        target.ancestors("[data-controller~='sheet']").first != scope
      end

      assert_predicate own_targets, :any?,
        "a sheet controller with no target of its own cannot close: #{scope.to_html.first(120)}"
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

  test "a push is queued for every notification, and does nothing without VAPID keys" do
    user = create_customer
    user.push_subscriptions.create!(endpoint: "https://push.example/a", p256dh_key: "k", auth_key: "a")

    notification = nil
    assert_enqueued_with job: PushDeliveryJob do
      notification = user.notifications.create!(kind: "payment", title: "Payment received")
      PushDeliveryJob.perform_later(notification.id)
    end

    # Without keys there is no rpush app, so nothing is handed over — and that
    # is a quiet no-op, not an error.
    assert_no_difference -> { Rpush::Webpush::Notification.count } do
      assert_nothing_raised { PushDeliveryJob.perform_now(notification.id) }
    end
  end

  test "with keys, one rpush notification is written per registered device" do
    with_vapid_keys do
      user = create_customer
      user.push_subscriptions.create!(endpoint: "https://push.example/phone", p256dh_key: "k1", auth_key: "a1")
      user.push_subscriptions.create!(endpoint: "https://push.example/tablet", p256dh_key: "k2", auth_key: "a2")
      notification = user.notifications.create!(kind: "proof", title: "Payment proof submitted",
                                                body: "Nu. 500", path: "/payment_proofs")

      assert_difference -> { Rpush::Webpush::Notification.count }, 2 do
        PushDeliveryJob.perform_now(notification.id)
      end

      push = Rpush::Webpush::Notification.order(:id).last
      registration = push.registration_ids.first.deep_symbolize_keys
      assert_equal "https://push.example/tablet", registration[:endpoint]
      assert_equal({ "p256dh" => "k2", "auth" => "a2" }, registration[:keys].stringify_keys)

      # The service worker reads exactly this.
      payload = JSON.parse(push.data["message"])
      assert_equal "Payment proof submitted", payload["title"]
      assert_equal "/payment_proofs", payload["path"]
      assert_equal "proof", payload["kind"]
      assert_equal "bangkee-proof-#{notification.id}", payload["tag"], "a proof is its own event"

      assert_equal WebPushConfig::APP_NAME, push.app.name
      assert_equal "test-public-key", JSON.parse(push.app.vapid_keypair)["public_key"]
    end
  end

  test "the rpush app is made once and picks up a rotated key" do
    with_vapid_keys do
      first = WebPushConfig.rpush_app

      assert_no_difference -> { Rpush::Webpush::App.count } do
        assert_equal first.id, WebPushConfig.rpush_app.id
      end

      ENV["VAPID_PUBLIC_KEY"] = "rotated-public-key"
      assert_equal "rotated-public-key", JSON.parse(WebPushConfig.rpush_app.vapid_keypair)["public_key"]
    end
  end

  test "a device whose endpoint has died is forgotten when delivery reports it gone" do
    with_vapid_keys do
      user = create_customer
      user.push_subscriptions.create!(endpoint: "https://push.example/gone", p256dh_key: "k", auth_key: "a")
      notification = user.notifications.create!(kind: "credit", title: "New credit")
      PushDeliveryJob.perform_now(notification.id)

      push = Rpush::Webpush::Notification.order(:id).last
      push.update!(failed: true, error_code: 410, error_description: "Gone")

      # What the daemon does when the push service answers 410.
      assert_difference -> { PushSubscription.count }, -1 do
        Rpush.reflection_stack.first.__dispatch(:notification_failed, push)
      end
    end
  end
end
