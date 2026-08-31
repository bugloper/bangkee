# Runs daily (config/recurring.yml). One reminder per overdue account per run.
class OverdueReminderJob < ApplicationJob
  queue_as :default

  def perform
    Shop.includes(:accounts).find_each do |shop|
      shop.overdue_accounts.each { |account| Notifier.overdue_reminder(account) }
    end
  end
end
