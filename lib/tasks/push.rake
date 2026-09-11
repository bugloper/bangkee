namespace :push do
  desc "Generate a VAPID key pair for Web Push"
  task keys: :environment do
    # web-push ships inside rpush and does the key generation; rpush itself
    # only loads it when the daemon delivers.
    require "web-push"

    pair = WebPush.generate_key
    puts "VAPID_PUBLIC_KEY=#{pair.public_key}"
    puts "VAPID_PRIVATE_KEY=#{pair.private_key}"
    puts "\nAdd those two lines to .env (development) or your production secrets,"
    puts "then run the delivery daemon alongside the app: bundle exec rpush start"
  end
end
