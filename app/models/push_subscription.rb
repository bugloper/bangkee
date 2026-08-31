# One row per browser that granted notification permission. Endpoints go stale
# when a user clears site data or uninstalls the PWA; a 404/410 from the push
# service means "delete this row" (see PushDelivery).
class PushSubscription < ApplicationRecord
  belongs_to :user

  validates :endpoint, :p256dh_key, :auth_key, presence: true
  validates :endpoint, uniqueness: true
end
