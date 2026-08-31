class NotificationsController < ApplicationController
  def index
    page_title "Notifications"
    @notifications = current_user.notifications.recent.limit(50)
    @unread_count = current_user.notifications.unread.count
  end

  def read
    notification = current_user.notifications.find(params[:id])
    notification.mark_read!
    redirect_to notification.path.presence || notifications_path
  end

  def read_all
    current_user.notifications.unread.update_all(read_at: Time.current)
    redirect_to notifications_path, notice: "All caught up."
  end
end
