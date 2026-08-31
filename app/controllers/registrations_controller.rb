class RegistrationsController < ApplicationController
  allow_unauthenticated_access
  before_action :redirect_if_authenticated

  # A visitor arriving from an invite link is signing up as a customer; anyone
  # else who reaches this page is opening a shop.
  def new
    @user = User.new(role: invited? ? :customer : :shop_owner)
  end

  def create
    @user = User.new(user_params)
    @user.role = invited? ? :customer : :shop_owner

    shop_name = params.dig(:user, :shop_name).to_s.strip

    if @user.shop_owner? && shop_name.blank?
      @user.errors.add(:base, "Your shop needs a name")
      return render :new, status: :unprocessable_entity
    end

    ActiveRecord::Base.transaction do
      @user.save!
      Shop.create!(name: shop_name, owner: @user) if @user.shop_owner?
    end

    start_new_session_for @user
    claim_pending_invitation
    redirect_to root_path, notice: "Welcome to Bangkee."
  rescue ActiveRecord::RecordInvalid
    render :new, status: :unprocessable_entity
  end

  private
    def user_params
      params.require(:user).permit(:name, :email_address, :phone, :password, :password_confirmation)
    end

    def invited? = session[:pending_invite_token].present?

    # BR-26
    def claim_pending_invitation
      token = session.delete(:pending_invite_token)
      return if token.blank? || !@user.customer?

      account = Account.find_by(invite_token: token)
      account&.claim!(@user)
    end

    def redirect_if_authenticated
      redirect_to root_path if authenticated?
    end
end
