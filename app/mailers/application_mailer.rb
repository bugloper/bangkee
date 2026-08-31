class ApplicationMailer < ActionMailer::Base
  default from: ENV.fetch("BANGKEE_MAIL_FROM", "Bangkee <notifications@bangkee.bt>")
  layout "mailer"
end
