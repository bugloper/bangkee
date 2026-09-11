# VAPID keys for Web Push, and the rpush app that delivers with them.
#
# Generate a pair with `bin/rails push:keys` and put them in .env (development)
# or your production secrets. Push is a no-op until they are set, so the app
# runs fine without them.
class WebPushConfig
  APP_NAME = "bangkee".freeze

  class << self
    def public_key  = ENV["VAPID_PUBLIC_KEY"].presence || credentials[:public_key]
    def private_key = ENV["VAPID_PRIVATE_KEY"].presence || credentials[:private_key]
    def subject     = ENV.fetch("VAPID_SUBJECT", "mailto:hello@bangkee.bt")

    def configured? = public_key.present? && private_key.present?

    # The rpush app every notification hangs off. Created on first use and
    # reused after that; the keypair is refreshed if it has been rotated, so a
    # new key does not need a manual tidy-up in the database.
    def rpush_app
      return nil unless configured?

      app = Rpush::Webpush::App.find_by(name: APP_NAME) || Rpush::Webpush::App.new(name: APP_NAME)
      app.connections = 1
      app.vapid_keypair = keypair_json
      app.save! if app.new_record? || app.changed?
      app
    end

    private
      def keypair_json
        { subject: subject, public_key: public_key, private_key: private_key }.to_json
      end

      def credentials = Rails.application.credentials.web_push || {}
  end
end
