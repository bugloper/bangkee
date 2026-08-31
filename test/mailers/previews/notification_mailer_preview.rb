# Preview at http://localhost:3007/rails/mailers/notification_mailer
class NotificationMailerPreview < ActionMailer::Preview
  def event
    NotificationMailer.with(notification: notification).event
  end

  private
    def notification
      user = User.first || User.new(name: "Karma Dorji", email_address: "karma@shop.bt")
      Notification.new(
        user: user,
        kind: "proof",
        title: "Payment proof submitted",
        body: "Pema Choden uploaded proof of Nu. 500",
        path: "/payment_proofs"
      )
    end
end
