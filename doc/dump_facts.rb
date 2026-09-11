# Run with `bin/rails runner` so the manual quotes the values the code uses,
# not values someone typed into a document once. Writes tmp/manual_facts.json
# for doc/build_manual.rb to read.
require "json"

facts = {
  commit: `git rev-parse --short HEAD`.strip,
  trial_days: Subscription::TRIAL_DAYS,
  grace_days: Subscription::GRACE_DAYS,
  price: OperatorBilling.price_cents / 100,
  credit_due_days: Shop.new.credit_due_days,
  max_image_mb: AttachableImage::MAX_BYTES / 1.megabyte,
  image_types: AttachableImage::ACCEPTED_TYPES.map { |type| type.split("/").last.upcase }.uniq,
  payment_methods: PaymentsController::METHODS,
  notification_kinds: Notification::KINDS,
  model: ReceiptExtractor::MODEL
}

path = Rails.root.join("tmp/manual_facts.json")
path.dirname.mkpath
path.write(JSON.pretty_generate(facts))
puts "wrote #{path} — #{facts.slice(:commit, :trial_days, :grace_days, :price, :credit_due_days).inspect}"
