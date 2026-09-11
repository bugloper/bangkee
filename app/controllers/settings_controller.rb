# One screen for everything that isn't the ledger: the shop, billing, bank
# details, notifications, installing the app, and signing out.
class SettingsController < ApplicationController
  # Reading language. Stored on the account when there is one so it follows the
  # person to their next device, and in the session otherwise.
  def update_language
    locale = params[:locale].to_s
    return redirect_to settings_path, alert: "That language is not available." unless
      I18n.available_locales.map(&:to_s).include?(locale)

    current_user.update!(locale: locale)
    session[:locale] = locale
    redirect_to settings_path, notice: I18n.with_locale(locale) { t("language.changed", default: "Language changed.") }
  end

  def show
    page_title "Settings"
    @shop = current_shop
    @subscription = current_subscription
    @bank_accounts_count = @shop&.bank_accounts&.count.to_i
    @push_enabled = current_user.push_subscriptions.exists?
    @push_configured = WebPushConfig.configured?
  end
end
