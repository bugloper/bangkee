class AccountsController < ApplicationController
  before_action :require_shop_owner, except: :show
  before_action :require_writable_shop, only: %i[ new create edit update destroy ]
  before_action :set_account, only: %i[ show edit update destroy ]

  def index
    scope = current_shop.accounts.by_name
    scope = scope.where("customer_name ILIKE :q OR customer_phone ILIKE :q", q: "%#{params[:q]}%") if params[:q].present?

    @query  = params[:q]
    @filter = params[:filter].presence
    @accounts = case @filter
    when "outstanding" then scope.outstanding
    when "overdue"     then scope.outstanding.select(&:overdue?)
    when "settled"     then scope.settled
    else scope
    end
  end

  def show
    page_title @account.display_name, back: owner_of?(@account) ? accounts_path : dashboard_path
    @ledger = @account.ledger(include_voided: true).reverse
    @proofs = @account.payment_proofs.recent.limit(5)
    @audit_events = @account.audit_events.recent.limit(10) if owner_of?(@account)
    unless owner_of?(@account)
      @bank_accounts = @account.shop.bank_accounts.active.ordered
      # A tab being run up right now on this account. It is not a balance yet,
      # which the screen says plainly.
      @open_tabs = @account.tabs.open.includes(:tab_items).order(:opened_at)
    end
    render owner_of?(@account) ? :show : :customer_show
  end

  def new
    @account = current_shop.accounts.new
  end

  def create
    @account = current_shop.accounts.new(account_params)

    if @account.save
      @account.log_audit(:account_created, actor: current_user, customer_name: @account.customer_name)
      redirect_to @account, notice: "#{@account.display_name} added."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @account.update(account_params)
      redirect_to @account, notice: "Customer updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    if @account.balance_cents.zero?
      @account.destroy
      redirect_to accounts_path, notice: "Customer removed."
    else
      redirect_to @account, alert: "Settle the balance before removing this customer."
    end
  end

  private
    def set_account
      @account = Account.includes(:shop).find(params[:id])
      # An owner sees their own shop's accounts; a customer sees only their own.
      unless owner_of?(@account) || @account.customer_id == current_user.id
        redirect_to root_path, alert: "That account is not yours to view."
      end
    end

    def owner_of?(account)
      current_user.shop_owner? && account.shop.owner_id == current_user.id
    end

    def account_params
      params.require(:account).permit(:customer_name, :customer_phone)
    end
end
