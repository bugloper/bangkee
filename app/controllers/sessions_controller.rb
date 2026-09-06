class SessionsController < ApplicationController
  allow_unauthenticated_access only: %i[ new create ]
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> { redirect_to new_session_path, alert: "Try again later." }

  def new
  end

  def create
    if user = User.authenticate_by(params.permit(:email_address, :password))
      start_new_session_for user

      # A receipt shared from a bank app before we knew who this was.
      if (receipt = claim_pending_receipt(user))
        return redirect_to receipt
      end

      redirect_to after_authentication_url
    else
      redirect_to new_session_path, alert: "Try another email address or password."
    end
  end

  def destroy
    terminate_session
    redirect_to new_session_path, status: :see_other
  end

  private
    def claim_pending_receipt(user)
      signed_id = session.delete(:pending_receipt_blob)
      return nil if signed_id.blank?

      SharedReceiptsController.claim_pending(user: user, signed_id: signed_id)
    end
end
