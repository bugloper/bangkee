class Shop < ApplicationRecord
  include Auditable

  belongs_to :owner, class_name: "User"
  has_one  :subscription, dependent: :destroy
  has_many :accounts, dependent: :destroy
  has_many :transactions, through: :accounts
  has_many :bank_accounts, dependent: :destroy
  has_many :payment_proofs, through: :accounts
  has_many :subscription_payments, dependent: :destroy

  validates :name, presence: true
  validates :credit_due_days, numericality: { only_integer: true, greater_than: 0 }

  # Every shop is billable from the moment it exists (BR-36).
  after_create :provision_subscription

  def overdue_accounts
    threshold = credit_due_days.days.ago
    accounts.where("balance_cents > 0")
            .where("last_activity_at IS NULL OR last_activity_at < ?", threshold)
            .order(balance_cents: :desc)
  end

  def total_outstanding_cents
    accounts.where("balance_cents > 0").sum(:balance_cents)
  end

  def primary_bank_account
    bank_accounts.active.order(primary: :desc, id: :asc).first
  end

  private
    def provision_subscription
      Subscription.provision!(self)
    end
end
