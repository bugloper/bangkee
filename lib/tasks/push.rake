namespace :push do
  desc "Generate a VAPID key pair for Web Push"
  task keys: :environment do
    pair = WebPush.generate_key
    puts "VAPID_PUBLIC_KEY=#{pair.public_key}"
    puts "VAPID_PRIVATE_KEY=#{pair.private_key}"
    puts "\nAdd those two lines to .env (development) or your production secrets."
  end
end
