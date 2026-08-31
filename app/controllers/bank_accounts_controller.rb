# §16 — the shop's published payment destinations.
class BankAccountsController < ApplicationController
  before_action :require_shop_owner
  before_action :require_writable_shop, except: :index
  before_action :set_bank_account, only: %i[ edit update destroy ]

  def index
    @bank_accounts = current_shop.bank_accounts.ordered
    @bank_account = current_shop.bank_accounts.new(primary: @bank_accounts.empty?)
  end

  def new
    @bank_account = current_shop.bank_accounts.new(primary: current_shop.bank_accounts.none?)
  end

  def create
    @bank_account = current_shop.bank_accounts.new(bank_account_params)

    if @bank_account.save
      redirect_to bank_accounts_path, notice: "Bank details saved."
    else
      @bank_accounts = current_shop.bank_accounts.ordered
      render :index, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @bank_account.update(bank_account_params)
      redirect_to bank_accounts_path, notice: "Bank details updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @bank_account.destroy
    redirect_to bank_accounts_path, notice: "Bank details removed."
  end

  private
    def set_bank_account
      @bank_account = current_shop.bank_accounts.find(params[:id])
    end

    def bank_account_params
      params.require(:bank_account).permit(:bank_name, :account_name, :account_number,
                                           :branch, :mobile_wallet, :instructions, :primary, :active)
    end
end
