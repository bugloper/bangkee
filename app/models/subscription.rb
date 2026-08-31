# §17 — one per shop. The stored `status` is a cache: what actually governs
# access is derived from server time every time it is asked (BR-37), so a clock
# on the client can never buy anyone an extra day.
class Subscription < ApplicationRecord
  include Auditable
  include HasMoneyAttribute

  TRIAL_DAYS = 14
  GRACE_DAYS = 14

  belongs_to :shop
  has_money_attribute :price

  enum :status, { trialing: 0, active: 1, past_due: 2, disabled: 3 }, validate: true

  def self.provision!(shop)
    period_end = TRIAL_DAYS.days.from_now
    create!(shop: shop, status: :trialing, current_period_end: period_end,
            grace_until: period_end + GRACE_DAYS.days)
  end

  # BR-37 — the authority on access.
  def effective_status
    now = Time.current
    if now <= current_period_end
      trialing? ? :trialing : :active
    elsif grace_until.present? && now <= grace_until
      :past_due
    else
      :disabled
    end
  end

  def write_locked? = effective_status == :disabled
  def in_grace?     = effective_status == :past_due
  def trial?        = effective_status == :trialing

  def days_remaining
    [ ((current_period_end - Time.current) / 1.day).ceil, 0 ].max
  end

  def grace_days_remaining
    return 0 if grace_until.blank?
    [ ((grace_until - Time.current) / 1.day).ceil, 0 ].max
  end

  # BR-43: extend from the later of now or the existing period end, so cover is
  # never lost and never double-applied.
  def extend_period!(months:, by: nil)
    self.class.transaction do
      base = [ current_period_end, Time.current ].max
      new_end = base + months.months
      update!(status: :active, current_period_end: new_end,
              grace_until: new_end + GRACE_DAYS.days, disabled_at: nil)
      log_audit(:period_extended, actor: by, months: months, current_period_end: new_end)
    end
  end

  # Keeps the cached column honest; called from the banner/enforcement path.
  def refresh_status!
    derived = effective_status
    return if status.to_sym == derived

    update_columns(status: self.class.statuses[derived],
                   disabled_at: (derived == :disabled ? (disabled_at || Time.current) : nil),
                   updated_at: Time.current)
  end

  def status_label
    { trialing: "Free trial", active: "Active", past_due: "Payment due", disabled: "Inactive" }[effective_status]
  end
end
