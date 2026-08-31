class Admin::DashboardController < Admin::BaseController
  def show
    page_title "Bangkee Admin"
    @pending = SubscriptionPayment.for_review.includes(:shop, :submitted_by).limit(5)
    @pending_count = SubscriptionPayment.pending.count
    @shops_count = Shop.count
    @approved_month_cents = SubscriptionPayment.approved
                              .where(reviewed_at: Time.current.all_month).sum(:amount_cents)
    @locked_count = Subscription.all.count { |s| s.effective_status == :disabled }
  end
end
