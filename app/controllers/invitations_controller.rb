# /join/:token — the link a shop owner shares with a customer.
class InvitationsController < ApplicationController
  allow_unauthenticated_access
  # resume_session is skipped when authentication isn't required, so an already
  # signed-in customer would otherwise look like a visitor here.
  before_action :resume_session

  def show
    @account = Account.find_by(invite_token: params[:token])
    return redirect_to root_path, alert: "That invite link is not valid." if @account.nil?

    @shop = @account.shop

    if current_user.nil?
      session[:pending_invite_token] = @account.invite_token
      return   # renders the invitation landing screen
    end

    # BR-25
    if current_user.shop_owner?
      redirect_to root_path, alert: "Invite links are for customers. Ask your customer to open it on their phone."
    elsif @account.customer_id == current_user.id
      redirect_to account_path(@account), notice: "You are already linked to #{@shop.name}."
    elsif @account.joined?
      redirect_to root_path, alert: "That account has already been claimed by someone else."
    elsif @account.claim!(current_user)
      Notifier.account_joined(@account)
      redirect_to account_path(@account), notice: "You are now linked to #{@shop.name}."
    else
      redirect_to root_path, alert: "That invite link could not be used."
    end
  end
end
