class TransactionsController < ApplicationController
  before_action :require_shop_owner
  before_action :require_writable_shop
  before_action :set_transaction

  def edit
  end

  def update
    if @transaction.update(transaction_params)
      @transaction.log_audit(:edited, actor: current_user, amount_cents: @transaction.amount_cents)
      redirect_to @transaction.account, notice: "Transaction updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  # BR-15: never deleted. The row stays, marked, and out of the balance.
  def void
    if @transaction.void!(by: current_user)
      Notifier.transaction_voided(@transaction)
      redirect_to @transaction.account, notice: "Transaction voided. It stays on the record."
    else
      redirect_to @transaction.account, alert: "That transaction was already voided."
    end
  end

  private
    def set_transaction
      @transaction = Transaction.joins(account: :shop)
                                .where(shops: { owner_id: current_user.id })
                                .find(params[:id])
    end

    def transaction_params
      params.require(:transaction).permit(:amount, :description, :notes, :payment_method, :occurred_at)
    end
end
