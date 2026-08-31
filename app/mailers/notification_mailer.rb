# §16.7: email SHOULD accompany the in-app notification. One mailer for every
# event, because the in-app row already says what happened in the words the
# recipient needs — restating it per event would be six ways to drift.
class NotificationMailer < ApplicationMailer
  def event
    @notification = params[:notification]
    @user = @notification.user
    @url = @notification.path.present? ? root_url.chomp("/") + @notification.path : root_url

    mail to: @user.email_address, subject: @notification.title
  end
end
