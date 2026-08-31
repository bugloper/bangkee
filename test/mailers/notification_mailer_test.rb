require "test_helper"

class NotificationMailerTest < ActionMailer::TestCase
  test "the email says what happened and links to the screen that shows it" do
    user = create_customer(name: "Dawa Tashi", email: "dawa@example.bt")
    notification = user.notifications.create!(
      kind: "payment", title: "Payment recorded at Karma General Shop",
      body: "Nu. 500 — your balance is now Nu. 700", path: "/accounts/12"
    )

    email = NotificationMailer.with(notification: notification).event

    assert_equal [ "dawa@example.bt" ], email.to
    assert_equal "Payment recorded at Karma General Shop", email.subject

    [ email.html_part, email.text_part ].each do |part|
      assert_match "Nu. 500", part.body.to_s
      assert_match "http://example.com/accounts/12", part.body.to_s
    end
  end

  test "a notification with no path links to the app itself" do
    user = create_customer
    notification = user.notifications.create!(kind: "overdue", title: "Balance overdue")

    email = NotificationMailer.with(notification: notification).event
    assert_match "http://example.com", email.html_part.body.to_s
  end
end
