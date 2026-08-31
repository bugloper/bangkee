# Sends one in-app notification out to every device the recipient has
# registered. A dead endpoint (404/410) is deleted rather than retried — the
# browser is gone and will register a new one when it comes back.
class PushDeliveryJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  def perform(notification_id)
    return unless WebPushConfig.configured?

    notification = Notification.find(notification_id)
    payload = {
      title: notification.title,
      body: notification.body,
      path: notification.path,
      tag: "bangkee-#{notification.kind}"
    }.to_json

    notification.user.push_subscriptions.each do |subscription|
      deliver(subscription, payload)
    end
  end

  private
    def deliver(subscription, payload)
      WebPush.payload_send(
        message: payload,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh_key,
        auth: subscription.auth_key,
        vapid: {
          subject: WebPushConfig.subject,
          public_key: WebPushConfig.public_key,
          private_key: WebPushConfig.private_key
        },
        urgency: "normal"
      )
      subscription.update_column(:last_used_at, Time.current)
    rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription
      subscription.destroy
    rescue WebPush::ResponseError => error
      Rails.logger.warn "[push] #{error.class}: #{error.message}"
    end
end
