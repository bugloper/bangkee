# The bell in the top bar. Every push notification has a row here too, so the
# in-app centre and the device notification never disagree.
class Notification < ApplicationRecord
  belongs_to :user

  KINDS = %w[ credit payment void overdue proof sub ].freeze

  validates :title, presence: true
  validates :kind, inclusion: { in: KINDS }

  scope :recent, -> { order(created_at: :desc) }
  scope :unread, -> { where(read_at: nil) }

  def read? = read_at.present?

  def mark_read!
    update!(read_at: Time.current) unless read?
  end
end
