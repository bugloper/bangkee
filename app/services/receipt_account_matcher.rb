# Works out which shop a shared receipt paid, by comparing the beneficiary the
# bank printed against the bank details each shop has published (§16). Only the
# accounts this customer is actually linked to are considered — a receipt can
# never point at a shop they have nothing to do with.
#
# Returns an Account or nil. Ambiguity resolves to nil on purpose: two shops
# that could match is a question for the customer, not a coin toss.
class ReceiptAccountMatcher
  # Bank apps mask the middle of an account number (····8901), so matching is
  # on the tail. Four digits is what the masking usually leaves.
  MIN_DIGITS = 4

  def initialize(receipt)
    @receipt = receipt
  end

  def call
    return nil if candidates.empty?

    by_account_number || by_account_name
  end

  private
    attr_reader :receipt

    def candidates
      @candidates ||= receipt.candidate_accounts.to_a
    end

    def bank_accounts_for(account)
      account.shop.bank_accounts.active
    end

    def by_account_number
      digits = digits_of(receipt.recipient_account)
      return nil if digits.length < MIN_DIGITS

      matches = candidates.select do |account|
        bank_accounts_for(account).any? { |bank| tails_match?(digits, digits_of(bank.account_number)) }
      end

      matches.one? ? matches.first : nil
    end

    def by_account_name
      name = normalise(receipt.recipient_name)
      return nil if name.blank?

      matches = candidates.select do |account|
        bank_accounts_for(account).any? { |bank| normalise(bank.account_name) == name } ||
          normalise(account.shop.name) == name
      end

      matches.one? ? matches.first : nil
    end

    # One number is often a masked version of the other, so compare the shorter
    # tail against the longer.
    def tails_match?(left, right)
      return false if right.length < MIN_DIGITS

      length = [ left.length, right.length ].min
      left.last(length) == right.last(length)
    end

    def digits_of(value) = value.to_s.gsub(/\D/, "")
    def normalise(value) = value.to_s.downcase.gsub(/[^a-z0-9]/, "").presence
end
