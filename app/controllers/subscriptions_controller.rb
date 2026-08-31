# §17 — the owner's billing screen. Never write-locked: an owner must always be
# able to reach the screen that restores their access.
class SubscriptionsController < ApplicationController
  before_action :require_shop_owner

  def show
    page_title "Billing"
    @subscription = current_subscription
    @subscription.refresh_status!
    @payments = current_shop.subscription_payments.recent
    @payment = current_shop.subscription_payments.new(months: 1, amount_cents: @subscription.price_cents)
  end
end
