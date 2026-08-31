# The share-this-link screen.
class InvitesController < ApplicationController
  before_action :require_shop_owner

  def show
    @account = current_shop.accounts.find(params[:account_id])
    page_title "Invite a customer", back: account_path(@account)
  end
end
