class ApplicationController < ActionController::Base
  include Authentication
  allow_browser versions: :modern
  stale_when_importmap_changes

  around_action :switch_locale

  helper_method :current_user, :current_shop, :current_subscription, :unread_notifications_count

  private
    # Signed-in people carry their own language; a walk-in reading a menu has no
    # account, so theirs rides in the session after ?locale= puts it there.
    def switch_locale(&action)
      requested = params[:locale].presence
      session[:locale] = requested if requested && I18n.available_locales.map(&:to_s).include?(requested)

      locale = current_user&.reading_locale || session[:locale] || I18n.default_locale
      I18n.with_locale(locale, &action)
    end

    # Views call the `page_title` helper; controllers that know the title before
    # rendering (a nested screen with a back link) call this.
    def page_title(title, back: nil)
      @page_title = title
      @back_path = back
    end

    # Notification permission is asked for after something worth being notified
    # about — never on arrival (see the pwa Stimulus controller).
    def offer_notifications_next
      return unless WebPushConfig.configured?
      return if current_user.nil? || current_user.push_subscriptions.exists?

      flash[:ask_push] = true
    end

    def current_user = Current.user

    def current_shop
      return unless current_user&.shop_owner?
      @current_shop ||= current_user.shop
    end

    def current_subscription
      return unless current_shop
      @current_subscription ||= current_shop.subscription
    end

    def unread_notifications_count
      return 0 unless current_user
      @unread_notifications_count ||= current_user.notifications.unread.count
    end

    def require_shop_owner
      redirect_to root_path, alert: "That area is for shop owners." unless current_user&.shop_owner?
    end

    def require_platform_admin
      redirect_to root_path, alert: "That area is for Bangkee staff." unless current_user&.platform_admin?
    end

    # BR-40: once the grace period is exhausted the owner keeps every read, but
    # writes stop until a payment is approved. Billing itself is never blocked.
    def require_writable_shop
      return unless current_subscription&.write_locked?

      current_subscription.refresh_status!
      redirect_to subscription_path,
        alert: "Your subscription is inactive — renew it to record credits and payments again."
    end
end
