# One screen for everything that isn't the ledger: the shop, billing, bank
# details, notifications, installing the app, and signing out.
class SettingsController < ApplicationController
  def show
    page_title "Settings"
    @shop = current_shop
    @subscription = current_subscription
    @bank_accounts_count = @shop&.bank_accounts&.count.to_i
    @push_enabled = current_user.push_subscriptions.exists?
    @push_configured = WebPushConfig.configured?
  end
end
