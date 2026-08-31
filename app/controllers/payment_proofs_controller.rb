# §16. Two audiences in one controller: a customer submitting a claim
# (new/create, nested under their account) and the owner reviewing the queue.
class PaymentProofsController < ApplicationController
  before_action :require_shop_owner, only: %i[ index confirm reject ]
  before_action :require_writable_shop, only: %i[ confirm reject ]
  before_action :set_account, only: %i[ new create ]
  before_action :set_proof, only: %i[ confirm reject ]

  def index
    @status = params[:status].presence || "pending"
    scope = current_shop.payment_proofs.includes(:account, :submitted_by).recent
    @proofs = @status == "all" ? scope : scope.where(status: @status)
    @pending_count = current_shop.payment_proofs.pending.count
  end

  def new
    @proof = @account.payment_proofs.new
    @bank_accounts = @account.shop.bank_accounts.active.ordered
    page_title "Upload payment proof", back: account_path(@account)
  end

  def create
    @proof = @account.payment_proofs.new(proof_params)
    @proof.submitted_by = current_user

    if @proof.save
      Notifier.proof_submitted(@proof)
      offer_notifications_next
      redirect_to account_path(@account),
        notice: "Proof sent to #{@account.shop.name}. Your balance updates once they confirm it."
    else
      @bank_accounts = @account.shop.bank_accounts.active.ordered
      render :new, status: :unprocessable_entity
    end
  end

  # BR-30
  def confirm
    if @proof.confirm!(by: current_user)
      Notifier.proof_confirmed(@proof)
      redirect_to payment_proofs_path, notice: "Payment of #{helpers.ngultrum(@proof.amount_cents)} recorded."
    else
      redirect_to payment_proofs_path, alert: "That proof was already reviewed."
    end
  end

  # BR-31
  def reject
    if @proof.reject!(by: current_user, reason: params[:rejection_reason])
      Notifier.proof_rejected(@proof)
      redirect_to payment_proofs_path, notice: "Proof rejected. #{@proof.account.display_name} has been told why."
    else
      redirect_to payment_proofs_path, alert: "That proof was already reviewed."
    end
  end

  private
    # BR-28: only the customer linked to the account may claim a payment on it.
    def set_account
      @account = Account.includes(:shop).find(params[:account_id])
      return if @account.customer_id == current_user.id

      redirect_to root_path, alert: "You can only upload proof for your own account."
    end

    def set_proof
      @proof = current_shop.payment_proofs.find(params[:id])
    end

    def proof_params
      params.require(:payment_proof).permit(:amount, :reference, :note, :screenshot)
    end
end
