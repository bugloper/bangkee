# §16 — a shop's published payment destination. The columns really are named
# `primary` and `active`; they shadow nothing important on ActiveRecord.
class BankAccount < ApplicationRecord
  belongs_to :shop

  validates :bank_name, :account_name, :account_number, presence: true

  scope :active,    -> { where(active: true) }
  scope :ordered,   -> { order(primary: :desc, id: :asc) }

  # BR-27: at most one primary per shop.
  after_save :demote_siblings, if: -> { primary? && saved_change_to_primary? }

  def label = "#{bank_name} · #{account_number}"

  private
    def demote_siblings
      shop.bank_accounts.where.not(id: id).where(primary: true).update_all(primary: false)
    end
end
