# Reads a shared receipt in the background. The customer is looking at a
# "reading your receipt" screen while this runs, so every path here ends with
# the receipt in a terminal state — there is no version of this job that leaves
# them staring at a spinner.
class ReceiptExtractionJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  def perform(shared_receipt_id, extractor: nil)
    receipt = SharedReceipt.find(shared_receipt_id)
    return unless receipt.pending_read?

    # Reading receipts is optional infrastructure. Where it is not configured
    # the customer gets the form straight away rather than a message about an
    # environment variable they have never heard of.
    if extractor.nil? && !ReceiptExtractor.configured?
      return receipt.update!(status: :unreadable,
                             failure_reason: "Bangkee cannot read receipts automatically yet.")
    end

    receipt.update!(status: :reading)

    result = (extractor || ReceiptExtractor.new).call(receipt.image.blob)

    unless result.payment_receipt?
      return receipt.update!(status: :unreadable, extraction: result.raw,
                             failure_reason: "That does not look like a completed transfer.")
    end

    receipt.update!(
      status: :read,
      amount_cents: result.amount_cents,
      recipient_name: result.recipient_name,
      recipient_account: result.recipient_account,
      sender_name: result.sender_name,
      reference: result.reference,
      paid_at: result.paid_at,
      bank_name: result.bank_name,
      confidence: result.confidence,
      extraction: result.raw
    )
    receipt.update!(matched_account: ReceiptAccountMatcher.new(receipt).call)
  rescue ReceiptExtractor::ExtractionError, Anthropic::Errors::APIError => error
    Rails.logger.warn "[receipt] #{error.class}: #{error.message}"
    receipt&.update!(status: :unreadable, failure_reason: friendly(error))
  end

  private
    def friendly(error)
      case error
      when Anthropic::Errors::RateLimitError then "Bangkee is busy reading receipts. Enter the details yourself, or try again in a minute."
      when Anthropic::Errors::APIError       then "Bangkee could not reach the receipt reader."
      else error.message
      end
    end
end
