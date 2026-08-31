# An entry recorded with no signal is replayed when the connection comes back,
# and a replay can arrive twice (the browser retried, the user reopened the
# app). The browser stamps each queued entry with a key; the second arrival of
# a key finds the entry already in the book and changes nothing.
module IdempotentWrites
  extend ActiveSupport::Concern

  private
    def idempotency_key
      params.dig(:transaction, :idempotency_key).presence
    end

    def already_recorded
      return nil if idempotency_key.blank?
      Transaction.find_by(idempotency_key: idempotency_key)
    end
end
