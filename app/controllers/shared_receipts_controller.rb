# The other end of the Android share sheet. A customer finishes a transfer in
# BoB or mBoB, taps Share, picks Bangkee, and the receipt arrives here as a
# plain multipart POST from the browser.
class SharedReceiptsController < ApplicationController
  # The share sheet POSTs from the OS: there is no Bangkee page behind it and
  # so no CSRF token to send. What that exposes is bounded — the action stores
  # a picture against the signed-in user and moves no money — and everything
  # after it (which shop, which amount) is confirmed on a normal, protected
  # form before a proof exists.
  skip_forgery_protection only: :create
  allow_unauthenticated_access only: :create

  before_action :set_receipt, only: %i[ show confirm ]

  def create
    file = params[:receipt] || params[:file] || params[:image]
    return redirect_to root_path, alert: "That share did not include a picture." if file.blank?

    # Signing in loses the POST body, so the image is banked first and picked
    # up again afterwards. A receipt is not something to make someone re-share.
    unless authenticated?
      blob = ActiveStorage::Blob.create_and_upload!(io: file.tempfile, filename: file.original_filename,
                                                    content_type: file.content_type)
      session[:pending_receipt_blob] = blob.signed_id
      return redirect_to new_session_path, notice: "Sign in and Bangkee will read your receipt."
    end

    receipt = build_receipt(image: file)
    return redirect_to root_path, alert: receipt.errors.full_messages.to_sentence unless receipt.persisted?

    redirect_to receipt
  end

  def show
    page_title "Your receipt", back: root_path
    @accounts = @receipt.candidate_accounts
  end

  # The customer has checked what Bangkee read and chosen the shop. From here
  # it is an ordinary §16 proof: pending until the shop confirms it.
  def confirm
    account = current_user.accounts.find_by(id: params[:account_id])
    return redirect_to @receipt, alert: "Choose which shop this payment was for." if account.nil?

    proof = account.payment_proofs.new(
      submitted_by: current_user,
      amount: params[:amount],
      reference: params[:reference],
      note: params[:note]
    )
    proof.screenshot.attach(@receipt.image.blob)

    if proof.save
      @receipt.update!(payment_proof: proof, matched_account: account)
      Notifier.proof_submitted(proof)
      offer_notifications_next
      redirect_to account_path(account),
        notice: "Proof sent to #{account.shop.name}. Your balance updates once they confirm it."
    else
      @accounts = @receipt.candidate_accounts
      @errors = proof.errors
      render :show, status: :unprocessable_entity
    end
  end

  # Called from the sessions controller once someone signs in with a receipt
  # waiting from before they were recognised.
  def self.claim_pending(user:, signed_id:)
    blob = ActiveStorage::Blob.find_signed(signed_id)
    return nil if blob.nil?

    receipt = SharedReceipt.new(user: user)
    receipt.image.attach(blob)
    return nil unless receipt.save

    ReceiptExtractionJob.perform_later(receipt.id)
    receipt
  end

  private
    def set_receipt
      @receipt = current_user.shared_receipts.find(params[:id])
    end

    def build_receipt(image:)
      receipt = current_user.shared_receipts.new(
        shared_title: params[:title], shared_text: params[:text]
      )
      receipt.image.attach(image)

      if receipt.save
        ReceiptExtractionJob.perform_later(receipt.id)
      end
      receipt
    end
end
