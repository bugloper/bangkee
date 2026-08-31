class SubscriptionPaymentsController < ApplicationController
  before_action :require_shop_owner

  def create
    @payment = current_shop.subscription_payments.new(payment_params)
    @payment.submitted_by = current_user

    if @payment.save
      Notifier.subscription_payment_submitted(@payment)
      redirect_to subscription_path, notice: "Payment sent to Bangkee for approval."
    else
      @subscription = current_subscription
      @payments = current_shop.subscription_payments.recent
      render "subscriptions/show", status: :unprocessable_entity
    end
  end

  private
    def payment_params
      params.require(:subscription_payment)
            .permit(:amount, :months, :reference, :screenshot, :method)
    end
end
