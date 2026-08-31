# Money received, recorded by the owner.
class PaymentsController < ApplicationController
  include IdempotentWrites
  before_action :require_shop_owner
  before_action :require_writable_shop
  before_action :set_account

  METHODS = [ "Cash", "Mobile transfer", "Bank transfer", "Other" ].freeze

  def new
    @transaction = @account.transactions.new(kind: :payment, payment_method: "Cash")
  end

  def create
    if (existing = already_recorded)
      return redirect_to existing.account, notice: "That payment was already recorded."
    end

    @transaction = @account.transactions.new(transaction_params)
    @transaction.kind = :payment
    @transaction.created_by = current_user

    if @transaction.save
      @transaction.log_audit(:created, actor: current_user,
                             kind: "payment", amount_cents: @transaction.amount_cents)
      Notifier.payment_recorded(@transaction)
      redirect_to @account, notice: "Payment of #{helpers.ngultrum(@transaction.amount_cents)} recorded."
    else
      render :new, status: :unprocessable_entity
    end
  end

  private
    def set_account
      @account = current_shop.accounts.find(params[:account_id])
    end

    def transaction_params
      params.require(:transaction).permit(:amount, :payment_method, :notes, :occurred_at, :idempotency_key)
    end
end
