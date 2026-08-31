require "test_helper"

# SRS §17 — status derives from server time, and lockout is the only thing a
# lapse takes away.
class SubscriptionTest < ActiveSupport::TestCase
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @subscription = @shop.subscription
  end

  test "a new shop is provisioned on a trial (BR-36)" do
    assert @subscription.present?, "provisioned with the shop"
    assert @subscription.trialing?
    assert_in_delta Subscription::TRIAL_DAYS.days.from_now, @subscription.current_period_end, 5.seconds
    assert_equal 20_000, @subscription.price_cents
  end

  test "status derives from server time, not the stored column (BR-37, BR-38)" do
    assert_equal :trialing, @subscription.effective_status

    @subscription.update!(current_period_end: 1.day.ago, grace_until: 13.days.from_now)
    assert_equal :past_due, @subscription.effective_status
    assert @subscription.in_grace?
    assert_not @subscription.write_locked?, "grace still writes"

    @subscription.update!(grace_until: 1.minute.ago)
    assert_equal :disabled, @subscription.effective_status
    assert @subscription.write_locked?
  end

  test "the stored status is a lie the model corrects on demand" do
    @subscription.update_columns(current_period_end: 30.days.ago, grace_until: 16.days.ago,
                                status: Subscription.statuses[:active])
    @subscription.refresh_status!
    assert @subscription.reload.disabled?
    assert @subscription.disabled_at.present?
  end

  test "approval extends from the period end so cover is never lost (BR-43)" do
    period_end = @subscription.current_period_end
    payment = build_payment(months: 2)
    payment.save!

    assert payment.approve!(by: create_admin)
    @subscription.reload

    assert_in_delta period_end + 2.months, @subscription.current_period_end, 5.seconds
    assert @subscription.active?
    assert_nil @subscription.disabled_at
    assert_in_delta @subscription.current_period_end + Subscription::GRACE_DAYS.days, @subscription.grace_until, 5.seconds
  end

  test "approval of a lapsed shop restores it immediately (FR-12.10)" do
    @subscription.update!(current_period_end: 40.days.ago, grace_until: 26.days.ago,
                          status: :disabled, disabled_at: 26.days.ago)
    payment = build_payment
    payment.save!

    payment.approve!(by: create_admin)
    assert_not @subscription.reload.write_locked?
    assert @subscription.current_period_end > Time.current
  end

  test "rejection leaves the period untouched (BR-44)" do
    period_end = @subscription.current_period_end
    payment = build_payment
    payment.save!

    assert payment.reject!(by: create_admin, reason: "no transfer received")
    assert payment.reload.rejected?
    assert_equal "no transfer received", payment.rejection_reason
    assert_in_delta period_end, @subscription.reload.current_period_end, 1.second
  end

  test "a reviewed payment cannot be reviewed again (BR-45)" do
    payment = build_payment
    payment.save!
    assert payment.approve!(by: create_admin)
    assert_not payment.approve!(by: create_admin)
    assert_not payment.reject!(by: create_admin, reason: "changed my mind")
  end

  test "months must be at least one and the method column is readable" do
    payment = build_payment(months: 0)
    assert_not payment.valid?

    payment.months = 1
    payment.amount_cents = 20_000
    payment.payment_method = "Bank transfer"
    assert payment.valid?
    assert_equal "Bank transfer", payment.payment_method
  end

  private
    def build_payment(months: 1)
      payment = @shop.subscription_payments.new(amount_cents: 20_000 * months, months: months,
                                                submitted_by: @owner)
      payment.screenshot.attach(io: File.open(screenshot_path), filename: "p.png", content_type: "image/png")
      payment
    end
end
