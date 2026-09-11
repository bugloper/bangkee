# Hands one in-app notification to rpush for every device the recipient has
# registered. rpush owns delivery from there: retries, backoff, and telling us
# when an endpoint is gone.
#
# Nothing is sent from this process. The rows sit in rpush_notifications until
# the delivery daemon picks them up (`bundle exec rpush start`), so a push
# service that is slow or down can never hold up the request that caused it.
class PushDeliveryJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  # A push should be about something that just happened. One that has been
  # sitting for hours is noise by the time it lands.
  TIME_TO_LIVE = 4.hours.to_i

  def perform(notification_id)
    app = WebPushConfig.rpush_app
    return if app.nil?   # no VAPID keys: push is switched off

    notification = Notification.find(notification_id)

    notification.user.push_subscriptions.find_each do |subscription|
      Rpush::Webpush::Notification.create!(
        app: app,
        registration_ids: [ registration_for(subscription) ],
        data: { message: payload_for(notification), urgency: "normal" },
        time_to_live: TIME_TO_LIVE
      )
    end
  end

  private
    # rpush wants exactly the shape the browser handed us at subscribe time.
    def registration_for(subscription)
      { endpoint: subscription.endpoint,
        keys: { "p256dh" => subscription.p256dh_key, "auth" => subscription.auth_key } }
    end

    # What the service worker reads in its push handler.
    def payload_for(notification)
      {
        title: notification.title,
        body: notification.body,
        path: notification.path,
        tag: "bangkee-#{notification.kind}"
      }.to_json
    end
end
