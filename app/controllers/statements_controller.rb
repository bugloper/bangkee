# A printable statement for one account — the page an owner hands over or a
# customer prints for their own records.
class StatementsController < ApplicationController
  def show
    @account = Account.includes(:shop).find(params[:account_id])
    unless owner? || @account.customer_id == current_user.id
      return redirect_to root_path, alert: "That account is not yours to view."
    end

    page_title "Statement", back: account_path(@account)
    @rows = @account.ledger
    @debit_cents  = @account.transactions.active.credit.sum(:amount_cents)
    @credit_cents = @account.transactions.active.payment.sum(:amount_cents)
  end

  private
    def owner?
      current_user.shop_owner? && @account.shop.owner_id == current_user.id
    end
end
