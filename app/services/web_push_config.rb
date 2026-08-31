# VAPID keys for Web Push. Generate a pair with `bin/rails push:keys` and put
# them in .env (development) or credentials/ENV (production). Push is a no-op
# until they are set, so the app runs fine without them.
class WebPushConfig
  class << self
    def public_key  = ENV["VAPID_PUBLIC_KEY"].presence || credentials[:public_key]
    def private_key = ENV["VAPID_PRIVATE_KEY"].presence || credentials[:private_key]
    def subject     = ENV.fetch("VAPID_SUBJECT", "mailto:hello@bangkee.bt")

    def configured? = public_key.present? && private_key.present?

    private
      def credentials = Rails.application.credentials.web_push || {}
  end
end
