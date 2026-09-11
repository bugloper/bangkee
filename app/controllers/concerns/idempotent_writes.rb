# An entry recorded with no signal is replayed when the connection comes back,
# and a replay can arrive twice (the browser retried, the user reopened the
# app). The browser stamps each queued entry with a key; the second arrival of
# a key finds the entry already in the book and changes nothing.
module IdempotentWrites
  extend ActiveSupport::Concern

  private
    # The key travels under whichever record the form is posting.
    def idempotency_key(scope = :transaction)
      params.dig(scope, :idempotency_key).presence
    end

    def already_recorded
      key = idempotency_key
      return nil if key.blank?
      Transaction.find_by(idempotency_key: key)
    end

    def already_added_to_tab
      key = idempotency_key(:tab_item)
      return nil if key.blank?
      TabItem.find_by(idempotency_key: key)
    end
end
