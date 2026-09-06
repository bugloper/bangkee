# A receipt shared into Bangkee straight from a bank's app — BoB, BNB, PNB —
# through the Web Share Target API. Bangkee reads the amount, reference and
# recipient off the picture so the customer does not retype what the bank
# already told them, then offers it as a payment proof for the shop whose
# published account the money went to.
#
# It never becomes a proof on its own: the customer confirms first (BR-28 says
# a proof is a claim *they* make), and the shop still confirms after that
# (BR-30). Reading a receipt moves nobody's balance.
class SharedReceipt < ApplicationRecord
  include HasMoneyAttribute
  include AttachableImage

  belongs_to :user
  belongs_to :matched_account, class_name: "Account", optional: true
  belongs_to :payment_proof, optional: true

  has_one_attached :image
  validates_attached_image :image

  has_money_attribute :amount

  enum :status, { received: 0, reading: 1, read: 2, unreadable: 3 }, validate: true

  scope :recent, -> { order(created_at: :desc) }
  scope :unclaimed, -> { where(payment_proof_id: nil) }

  def settled? = payment_proof_id.present?
  def pending_read? = received? || reading?

  # Which of this customer's accounts the money plausibly went to. Only ever a
  # suggestion — the customer picks.
  def candidate_accounts
    user.accounts.includes(:shop).order(balance_cents: :desc)
  end

  def confidence_label
    case confidence
    when "high"   then "Read clearly"
    when "medium" then "Mostly clear — check the amount"
    when "low"    then "Hard to read — check everything"
    else "Check the details"
    end
  end
end
