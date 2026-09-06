# Reads a Bhutanese bank transfer receipt with Claude and returns the fields a
# payment proof needs. Vision plus structured outputs: the schema is the
# contract, so the caller never parses prose.
#
# Extraction is best-effort by design. A blurry photo, an unfamiliar bank, or
# no API key at all must leave the customer with a working (if empty) form —
# never a dead end.
class ReceiptExtractor
  MODEL = "claude-opus-5".freeze

  # Every field the confirm screen can pre-fill. Nullable throughout: the model
  # is told to leave a field null rather than guess it, because a wrong amount
  # on a payment claim is worse than a blank one.
  SCHEMA = {
    type: "object",
    properties: {
      is_payment_receipt: { type: "boolean" },
      amount: { type: [ "number", "null" ] },
      currency: { type: [ "string", "null" ] },
      recipient_name: { type: [ "string", "null" ] },
      recipient_account: { type: [ "string", "null" ] },
      sender_name: { type: [ "string", "null" ] },
      reference: { type: [ "string", "null" ] },
      paid_at: { type: [ "string", "null" ], description: "ISO 8601, as printed on the receipt" },
      bank_name: { type: [ "string", "null" ] },
      confidence: { type: "string", enum: %w[ high medium low ] },
      notes: { type: [ "string", "null" ] }
    },
    required: %w[ is_payment_receipt amount currency recipient_name recipient_account
                  sender_name reference paid_at bank_name confidence notes ],
    additionalProperties: false
  }.freeze

  INSTRUCTIONS = <<~PROMPT.freeze
    You are reading a payment receipt screenshot from a Bhutanese bank or mobile
    wallet — Bank of Bhutan (BoB/mBoB), Bhutan National Bank (BNB), Punjab
    National Bank (PNB), Druk PNB, T-Bank, or a similar app.

    Read only what is printed. Rules:

    - `amount` is the amount transferred, in Ngultrum, as a number without
      separators (Nu. 1,250.50 becomes 1250.50). Ignore balances, fees and
      charges — only the amount that moved.
    - `recipient_account` is the beneficiary's account number exactly as shown,
      including any masking (····8901). Do not invent the hidden digits.
    - `reference` is the journal number, transaction id or reference the bank
      prints for this transfer.
    - `paid_at` is when the transfer happened, in ISO 8601. If the receipt shows
      no year, use the current year. If there is no date at all, use null.
    - `confidence` is `high` when the amount and the recipient are both crisply
      legible, `medium` when one is uncertain, `low` when the image is blurred,
      cropped or partly unreadable.
    - `is_payment_receipt` is false for anything that is not a completed
      transfer — a balance screen, a failed transaction, a photo of something
      else entirely.

    If a field is not printed on the receipt, return null for it. Never guess a
    number. A missing value is fine; a wrong one is not.
  PROMPT

  Result = Data.define(:amount_cents, :recipient_name, :recipient_account, :sender_name,
                       :reference, :paid_at, :bank_name, :confidence, :payment_receipt, :raw) do
    def payment_receipt? = payment_receipt
  end

  class ExtractionError < StandardError; end

  def self.configured? = ENV["ANTHROPIC_API_KEY"].present?

  # `client` is injectable so tests never reach the network.
  def initialize(client: nil)
    @client = client
  end

  def call(image_blob)
    raise ExtractionError, "No ANTHROPIC_API_KEY is configured" unless self.class.configured? || @client

    message = client.messages.create(
      model: MODEL,
      max_tokens: 2_000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [ {
        role: "user",
        content: [
          { type: "image",
            source: { type: "base64", media_type: media_type_for(image_blob), data: encoded(image_blob) } },
          { type: "text", text: INSTRUCTIONS }
        ]
      } ]
    )

    build_result(parse(message))
  end

  private
    def client
      @client ||= Anthropic::Client.new
    end

    def parse(message)
      raise ExtractionError, "Claude declined to read the receipt" if message.stop_reason == :refusal

      json = message.content.find { |block| block.type == :text }&.text
      raise ExtractionError, "No readable answer came back" if json.blank?

      JSON.parse(json)
    rescue JSON::ParserError => error
      raise ExtractionError, "Could not parse the extraction: #{error.message}"
    end

    def build_result(data)
      Result.new(
        amount_cents: cents(data["amount"], data["currency"]),
        recipient_name: presence(data["recipient_name"]),
        recipient_account: presence(data["recipient_account"]),
        sender_name: presence(data["sender_name"]),
        reference: presence(data["reference"]),
        paid_at: timestamp(data["paid_at"]),
        bank_name: presence(data["bank_name"]),
        confidence: data["confidence"].presence || "low",
        payment_receipt: data["is_payment_receipt"] == true,
        raw: data
      )
    end

    # Only Ngultrum is accepted. A receipt in another currency is not something
    # Bangkee can turn into a Nu. claim, so the amount is dropped and the
    # customer is left to decide.
    def cents(amount, currency)
      return nil if amount.blank?
      return nil unless currency.blank? || currency.to_s.upcase.in?(%w[ BTN NU NU. NGULTRUM ])

      (BigDecimal(amount.to_s) * 100).round
    rescue ArgumentError, TypeError
      nil
    end

    def timestamp(value)
      return nil if value.blank?
      Time.zone.parse(value.to_s)
    rescue ArgumentError
      nil
    end

    def presence(value) = value.is_a?(String) ? value.strip.presence : nil

    def media_type_for(blob)
      type = blob.content_type.to_s
      type.in?(AttachableImage::ACCEPTED_TYPES) ? type : "image/jpeg"
    end

    def encoded(blob)
      Base64.strict_encode64(blob.download)
    end
end
