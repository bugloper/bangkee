# The browser hands us an endpoint and two keys; that triple is what lets the
# server push to this one device.
class PushSubscriptionsController < ApplicationController
  skip_forgery_protection only: :destroy   # sent from the service worker, no form

  def create
    subscription = current_user.push_subscriptions.find_or_initialize_by(endpoint: params[:endpoint])
    subscription.assign_attributes(
      p256dh_key: params[:p256dh_key],
      auth_key: params[:auth_key],
      user_agent: request.user_agent,
      last_used_at: Time.current
    )

    if subscription.save
      head :created
    else
      head :unprocessable_entity
    end
  end

  def destroy
    current_user.push_subscriptions.where(endpoint: params[:endpoint]).destroy_all
    head :no_content
  end
end
