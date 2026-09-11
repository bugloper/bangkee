# Running bills. A restaurant, bar or snooker hall opens one per table, adds to
# it through the evening, and settles it when the customer leaves.
class TabsController < ApplicationController
  before_action :require_shop_owner
  before_action :require_writable_shop, except: :index
  before_action :set_tab, only: %i[ show settle void ]

  def index
    page_title "Tabs"
    @open_tabs = current_shop.tabs.open.includes(:account).recent
    @recent = current_shop.tabs.where.not(status: :open).includes(:account).settled_recently.limit(10)
  end

  def new
    page_title "Open a tab", back: tabs_path
    @tab = current_shop.tabs.new(label: suggested_label)
    @accounts = current_shop.accounts.by_name
  end

  def create
    @tab = current_shop.tabs.new(tab_params)
    @tab.opened_by = current_user
    # Looked up through the shop, never mass-assigned: an id from the form must
    # not be able to name a customer at someone else's shop.
    @tab.account = current_shop.accounts.find_by(id: params[:tab][:account_id])

    if @tab.save
      @tab.log_audit(:opened, actor: current_user, label: @tab.label)
      redirect_to @tab
    else
      @accounts = current_shop.accounts.by_name
      render :new, status: :unprocessable_entity
    end
  end

  def show
    page_title @tab.label, back: tabs_path
    @items = @tab.tab_items.order(:created_at)
    @suggestions = current_shop.frequent_tab_items
    @accounts = current_shop.accounts.by_name
  end

  # Either the money is on the counter, or it goes on someone's page.
  def settle
    case params[:settlement]
    when "paid"
      if @tab.settle_paid!(by: current_user, method: params[:payment_method])
        redirect_to tabs_path, notice: "#{@tab.label} settled — #{helpers.ngultrum @tab.total_cents} paid."
      else
        redirect_to @tab, alert: settle_failure
      end
    when "credited"
      account = current_shop.accounts.find_by(id: params[:account_id])
      return redirect_to @tab, alert: "Choose whose book this goes on." if account.nil?

      if @tab.settle_on_credit!(by: current_user, account: account)
        Notifier.credit_recorded(@tab.settlement_transaction)
        offer_notifications_next
        redirect_to account_path(account),
          notice: "#{@tab.label} put on #{account.display_name}'s book — #{helpers.ngultrum @tab.total_cents}."
      else
        redirect_to @tab, alert: settle_failure
      end
    else
      redirect_to @tab, alert: "Say whether this was paid or goes on the book."
    end
  end

  def void
    if @tab.void!(by: current_user)
      redirect_to tabs_path, notice: "#{@tab.label} closed without charging."
    else
      redirect_to @tab, alert: "That tab is already closed."
    end
  end

  private
    def set_tab
      @tab = current_shop.tabs.find(params[:id])
    end

    def tab_params
      params.require(:tab).permit(:label, :note)
    end

    def settle_failure
      @tab.empty? ? "Add something to the tab before settling it." : "That tab is already closed."
    end

    # Most of these are tables, and the next one is usually the next number.
    def suggested_label
      used = current_shop.tabs.open.pluck(:label)
      candidate = (1..99).find { |number| used.exclude?("Table #{number}") }
      "Table #{candidate}"
    end
end
