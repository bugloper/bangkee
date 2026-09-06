require "test_helper"

# Whatever happens to the read, the customer must end up on a screen they can
# act on. No path here may leave a receipt stuck in "reading".
class ReceiptExtractionJobTest < ActiveJob::TestCase
  setup do
    @customer = create_customer
    @receipt = SharedReceipt.new(user: @customer)
    @receipt.image.attach(io: File.open(screenshot_path), filename: "r.png", content_type: "image/png")
    @receipt.save!
  end

  test "a read receipt lands in read with its fields filled" do
    perform_with Reader.new

    assert @receipt.reload.read?
    assert_equal 50_000, @receipt.amount_cents
    assert_equal "BT123", @receipt.reference
  end

  test "a picture that is not a transfer is marked unreadable with a reason" do
    perform_with Reader.new(payment_receipt: false)

    assert @receipt.reload.unreadable?
    assert_match "completed transfer", @receipt.failure_reason
  end

  test "an extractor failure is caught and explained, never left spinning" do
    perform_with Failing.new(ReceiptExtractor::ExtractionError.new("Could not parse the extraction"))

    assert @receipt.reload.unreadable?
    assert_match "Could not parse", @receipt.failure_reason
  end

  test "the API being unreachable is caught and phrased for a shopkeeper" do
    outage = Anthropic::Errors::APIConnectionError.new(url: URI("https://api.anthropic.com/v1/messages"))
    perform_with Failing.new(outage)

    assert @receipt.reload.unreadable?
    assert_match "could not reach", @receipt.failure_reason
    assert_no_match(/anthropic|api\.anthropic/i, @receipt.failure_reason,
      "a shopkeeper reads this — it must not leak the vendor or a stack detail")
  end

  test "with no API key the customer gets the form, not a word about env vars" do
    assert_not ReceiptExtractor.configured?

    ReceiptExtractionJob.new.perform(@receipt.id)   # no injected extractor

    assert @receipt.reload.unreadable?
    assert_equal "Bangkee cannot read receipts automatically yet.", @receipt.failure_reason
    assert_no_match(/API_KEY|ENV|configured/i, @receipt.failure_reason)
  end

  test "a receipt already read is not read again" do
    @receipt.update!(status: :read, amount_cents: 111)
    perform_with Reader.new

    assert_equal 111, @receipt.reload.amount_cents, "a re-run must not overwrite a confirmed read"
  end

  private
    def perform_with(extractor)
      ReceiptExtractionJob.new.perform(@receipt.id, extractor: extractor)
    end

    class Reader
      def initialize(payment_receipt: true) = @payment_receipt = payment_receipt

      def call(_blob)
        ReceiptExtractor::Result.new(
          amount_cents: 50_000, recipient_name: "Karma Dorji", recipient_account: "1023",
          sender_name: "Dawa", reference: "BT123", paid_at: Time.current,
          bank_name: "BoB", confidence: "high", payment_receipt: @payment_receipt, raw: { "ok" => true }
        )
      end
    end

    class Failing
      def initialize(error) = @error = error
      def call(_blob) = raise(@error)
    end
end
