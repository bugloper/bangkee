class Admin::SubscriptionPaymentsController < Admin::BaseController
  before_action :set_payment, only: %i[ approve reject ]

  def index
    page_title "Subscription payments", back: admin_root_path
    @status = params[:status].presence || "pending"
    scope = SubscriptionPayment.includes(:shop, :submitted_by).recent
    @payments = @status == "all" ? scope : scope.where(status: @status)
    @pending_count = SubscriptionPayment.pending.count
  end

  # BR-43
  def approve
    if @payment.approve!(by: current_user)
      Notifier.subscription_payment_approved(@payment)
      redirect_to admin_subscription_payments_path,
        notice: "Approved. #{@payment.shop.name} is paid through #{@payment.shop.subscription.current_period_end.to_date.strftime('%-d %b %Y')}."
    else
      redirect_to admin_subscription_payments_path, alert: "That payment was already reviewed."
    end
  end

  # BR-44
  def reject
    if @payment.reject!(by: current_user, reason: params[:rejection_reason])
      Notifier.subscription_payment_rejected(@payment)
      redirect_to admin_subscription_payments_path, notice: "Rejected. The owner has been told why."
    else
      redirect_to admin_subscription_payments_path, alert: "That payment was already reviewed."
    end
  end

  private
    def set_payment
      @payment = SubscriptionPayment.find(params[:id])
    end
end
