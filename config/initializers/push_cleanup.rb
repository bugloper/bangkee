# A push endpoint dies when someone clears their site data, uninstalls the PWA,
# or the browser rotates it. The push service answers 404 or 410 and rpush
# marks the notification failed — which is the only moment we learn the device
# is gone, so that is where the row goes.
Rpush.reflect do |on|
  on.notification_failed do |notification|
    next unless notification.is_a?(Rpush::Client::ActiveRecord::Webpush::Notification)
    next unless notification.error_code.in?([ 404, 410 ])

    endpoint = notification.registration_ids.first.try(:[], "endpoint") ||
               notification.registration_ids.first.try(:[], :endpoint)
    PushSubscription.where(endpoint: endpoint).destroy_all if endpoint.present?
  end
end
