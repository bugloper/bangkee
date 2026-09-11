class DashboardsController < ApplicationController
  def show
    return redirect_to admin_root_path if current_user.platform_admin?

    if current_user.shop_owner?
      @shop = current_shop
      return redirect_to new_registration_path, alert: "Your shop is missing." if @shop.nil?

      @total_outstanding_cents = @shop.total_outstanding_cents
      @customers_count   = @shop.accounts.count
      @overdue_accounts  = @shop.overdue_accounts.limit(5)
      @overdue_count     = @shop.overdue_accounts.count
      @pending_proofs    = @shop.payment_proofs.pending.count
      @open_tabs         = @shop.tabs.open.count
      @open_tabs_cents   = @shop.open_tabs_total_cents
      @repaid_month_cents = @shop.transactions.active.payment
                                 .where(occurred_at: Time.current.all_month).sum(:amount_cents)
      @recent_transactions = @shop.transactions.active.includes(:account).recent.limit(6)
      render :owner
    else
      @accounts = current_user.accounts.includes(:shop).order(balance_cents: :desc)
      @total_owed_cents = @accounts.sum { |a| [ a.balance_cents, 0 ].max }
      @spent_month_cents = Transaction.active.credit
                             .where(account: @accounts, occurred_at: Time.current.all_month)
                             .sum(:amount_cents)
      @recent_transactions = Transaction.active.where(account: @accounts)
                              .includes(account: :shop).recent.limit(6)
      render :customer
    end
  end
end
