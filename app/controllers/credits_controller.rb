# Recording a credit: goods taken on tick. Simple by default, itemized when the
# owner wants the shopping list on the record.
class CreditsController < ApplicationController
  include IdempotentWrites
  before_action :require_shop_owner
  before_action :require_writable_shop
  before_action :set_account

  def new
    @itemized = params[:mode] == "itemized"
    @transaction = @account.transactions.new(kind: :credit, itemized: @itemized)
    @transaction.line_items.build if @itemized
  end

  def create
    if (existing = already_recorded)
      return redirect_to existing.account, notice: "That entry was already recorded."
    end

    @itemized = transaction_params[:itemized] == "1"
    @transaction = @account.transactions.new(transaction_params)
    @transaction.kind = :credit
    @transaction.created_by = current_user

    if @transaction.save
      @transaction.log_audit(:created, actor: current_user,
                             kind: "credit", amount_cents: @transaction.amount_cents)
      Notifier.credit_recorded(@transaction)
      redirect_to @account, notice: "Credit of #{helpers.ngultrum(@transaction.amount_cents)} recorded."
    else
      @transaction.line_items.build if @itemized && @transaction.line_items.empty?
      render :new, status: :unprocessable_entity
    end
  end

  private
    def set_account
      @account = current_shop.accounts.find(params[:account_id])
    end

    def transaction_params
      params.require(:transaction).permit(
        :amount, :description, :notes, :occurred_at, :itemized, :idempotency_key,
        line_items_attributes: %i[ id name quantity unit_price _destroy ]
      )
    end
end
