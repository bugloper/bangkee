require "test_helper"

# The extractor is the one place a wrong answer becomes a wrong money claim, so
# these cover what it does with imperfect readings, not just the happy path.
class ReceiptExtractorTest < ActiveSupport::TestCase
  setup do
    @customer = create_customer
    @receipt = SharedReceipt.new(user: @customer)
    @receipt.image.attach(io: File.open(screenshot_path), filename: "r.png", content_type: "image/png")
    @receipt.save!
  end

  test "a clear receipt comes back as fields the confirm screen can use" do
    result = extract(
      "is_payment_receipt" => true, "amount" => 1250.50, "currency" => "BTN",
      "recipient_name" => "Karma Dorji", "recipient_account" => "1023 4567 8901",
      "sender_name" => "Pema Choden", "reference" => "BT26082911022",
      "paid_at" => "2026-08-29T11:02:00+06:00", "bank_name" => "Bank of Bhutan",
      "confidence" => "high", "notes" => nil
    )

    assert result.payment_receipt?
    assert_equal 125_050, result.amount_cents, "Nu. 1,250.50 is 125050 chetrum"
    assert_equal "Karma Dorji", result.recipient_name
    assert_equal "BT26082911022", result.reference
    assert_equal "high", result.confidence
    assert_in_delta Time.zone.parse("2026-08-29T11:02:00+06:00"), result.paid_at, 1.second
  end

  test "a field the receipt does not show comes back nil rather than guessed" do
    result = extract("amount" => nil, "reference" => nil, "paid_at" => nil, "recipient_account" => nil)

    assert_nil result.amount_cents
    assert_nil result.reference
    assert_nil result.paid_at
    assert_nil result.recipient_account
  end

  test "an amount in another currency is dropped, not converted" do
    result = extract("amount" => 40.0, "currency" => "USD")
    assert_nil result.amount_cents, "Bangkee's ledger is in Ngultrum; a USD figure is not a Nu. claim"
  end

  test "a screen that is not a completed transfer is flagged" do
    result = extract("is_payment_receipt" => false, "amount" => 5000.0)
    assert_not result.payment_receipt?
  end

  test "a nonsense date does not blow up the read" do
    result = extract("paid_at" => "sometime last Losar")
    assert_nil result.paid_at
    assert result.payment_receipt?
  end

  test "the request carries the image and asks for the agreed schema" do
    client = FakeClient.new(response_for({}))
    ReceiptExtractor.new(client: client).call(@receipt.image.blob)

    request = client.requests.sole
    assert_equal "claude-opus-5", request[:model]
    assert_equal "json_schema", request.dig(:output_config, :format, :type)
    assert_equal ReceiptExtractor::SCHEMA, request.dig(:output_config, :format, :schema)

    image = request[:messages].first[:content].find { |block| block[:type] == "image" }
    assert_equal "image/png", image.dig(:source, :media_type)
    assert_equal Base64.strict_encode64(@receipt.image.blob.download), image.dig(:source, :data)
  end

  test "a refusal is an error the caller can show, not a silent empty result" do
    client = FakeClient.new(FakeMessage.new(stop_reason: :refusal, content: []))

    error = assert_raises ReceiptExtractor::ExtractionError do
      ReceiptExtractor.new(client: client).call(@receipt.image.blob)
    end
    assert_match "declined", error.message
  end

  test "an answer that is not JSON is an error, not a crash" do
    client = FakeClient.new(FakeMessage.new(content: [ FakeBlock.new(:text, "I cannot read this") ]))

    assert_raises ReceiptExtractor::ExtractionError do
      ReceiptExtractor.new(client: client).call(@receipt.image.blob)
    end
  end

  test "without an API key it refuses up front instead of half-working" do
    assert_not ReceiptExtractor.configured?, "no key should be set in test"

    assert_raises ReceiptExtractor::ExtractionError do
      ReceiptExtractor.new.call(@receipt.image.blob)
    end
  end

  private
    def extract(overrides)
      client = FakeClient.new(response_for(overrides))
      ReceiptExtractor.new(client: client).call(@receipt.image.blob)
    end

    def response_for(overrides)
      payload = {
        "is_payment_receipt" => true, "amount" => 500.0, "currency" => "BTN",
        "recipient_name" => "Karma Dorji", "recipient_account" => "1023 4567 8901",
        "sender_name" => "Pema Choden", "reference" => "BT123", "paid_at" => nil,
        "bank_name" => "Bank of Bhutan", "confidence" => "medium", "notes" => nil
      }.merge(overrides)

      FakeMessage.new(content: [ FakeBlock.new(:text, payload.to_json) ])
    end

    # Small stand-ins for the SDK's response objects — enough surface for what
    # the extractor reads, and no network.
    FakeBlock = Struct.new(:type, :text)
    FakeMessage = Struct.new(:content, :stop_reason, keyword_init: true)

    class FakeClient
      attr_reader :requests

      def initialize(message)
        @message = message
        @requests = []
      end

      def messages = self

      def create(**params)
        @requests << params
        @message
      end
    end
end
