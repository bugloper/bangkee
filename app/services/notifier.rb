# One place that knows who cares about what. Every event writes an in-app
# notification (the bell) and, if the recipient has a device registered, sends
# a Web Push for it — so the two never disagree.
class Notifier
  class << self
    def credit_recorded(transaction)
      account = transaction.account
      notify(account.customer, kind: "credit",
        title: "New credit at #{account.shop.name}",
        body: "#{money(transaction.amount_cents)}#{" · #{transaction.description}" if transaction.description.present?}",
        path: Rails.application.routes.url_helpers.account_path(account))
    end

    def payment_recorded(transaction)
      account = transaction.account
      notify(account.customer, kind: "payment",
        title: "Payment recorded at #{account.shop.name}",
        body: "#{money(transaction.amount_cents)} — your balance is now #{money(account.balance_cents)}",
        path: Rails.application.routes.url_helpers.account_path(account))
    end

    def transaction_voided(transaction)
      account = transaction.account
      notify(account.customer, kind: "void",
        title: "Entry voided at #{account.shop.name}",
        body: "#{transaction.kind.titleize} of #{money(transaction.amount_cents)} no longer counts",
        path: Rails.application.routes.url_helpers.account_path(account))
    end

    def account_joined(account)
      notify(account.shop.owner, kind: "credit",
        title: "#{account.display_name} joined",
        body: "They can now see their balance at #{account.shop.name}",
        path: Rails.application.routes.url_helpers.account_path(account))
    end

    def overdue_reminder(account)
      notify(account.shop.owner, kind: "overdue",
        title: "Overdue — #{account.display_name}",
        body: "#{money(account.balance_cents)} outstanding for #{account.days_overdue} days",
        path: Rails.application.routes.url_helpers.account_path(account))
      notify(account.customer, kind: "overdue",
        title: "Balance overdue at #{account.shop.name}",
        body: "#{money(account.balance_cents)} has been outstanding for #{account.days_overdue} days",
        path: Rails.application.routes.url_helpers.account_path(account))
    end

    # Scan-to-order: the counter screen makes a sound, but whoever is running
    # the shop may be nowhere near it.
    def table_order_placed(order)
      notify(order.shop.owner, kind: "credit",
        title: "New order — #{order.shop_table.name}",
        body: "#{order.table_order_items.size} #{"item".pluralize(order.table_order_items.size)} · #{money(order.total_cents)}",
        path: Rails.application.routes.url_helpers.orders_path)
    end

    # §16
    def proof_submitted(proof)
      notify(proof.account.shop.owner, kind: "proof",
        title: "Payment proof submitted",
        body: "#{proof.account.display_name} uploaded proof of #{money(proof.amount_cents)}",
        path: Rails.application.routes.url_helpers.payment_proofs_path)
    end

    def proof_confirmed(proof)
      notify(proof.account.customer, kind: "payment",
        title: "Payment confirmed",
        body: "#{proof.account.shop.name} confirmed #{money(proof.amount_cents)}",
        path: Rails.application.routes.url_helpers.account_path(proof.account))
    end

    def proof_rejected(proof)
      notify(proof.account.customer, kind: "proof",
        title: "Payment proof rejected",
        body: proof.rejection_reason.presence || "The shop could not match your transfer",
        path: Rails.application.routes.url_helpers.account_path(proof.account))
    end

    # §17
    def subscription_payment_submitted(payment)
      User.where(platform_admin: true).find_each do |admin|
        notify(admin, kind: "sub",
          title: "Subscription payment submitted",
          body: "#{payment.shop.name} — #{money(payment.amount_cents)} for #{pluralize_months(payment.months)}",
          path: Rails.application.routes.url_helpers.admin_subscription_payments_path)
      end
    end

    def subscription_payment_approved(payment)
      notify(payment.submitted_by, kind: "sub",
        title: "Subscription payment approved",
        body: "Paid through #{payment.shop.subscription.current_period_end.to_date.strftime('%-d %b %Y')}",
        path: Rails.application.routes.url_helpers.subscription_path)
    end

    def subscription_payment_rejected(payment)
      notify(payment.submitted_by, kind: "sub",
        title: "Subscription payment rejected",
        body: payment.rejection_reason.presence || "Bangkee could not match your transfer",
        path: Rails.application.routes.url_helpers.subscription_path)
    end

    private
      # One event, three surfaces: the bell, the device, the inbox. The email
      # and the push are queued, so a mail server that is down or a push
      # endpoint that is gone can never stop the ledger from being written
      # (§16.9, §17.9).
      def notify(user, kind:, title:, body: nil, path: nil)
        return if user.nil?   # an account with no customer linked yet

        notification = user.notifications.create!(kind: kind, title: title, body: body, path: path)
        PushDeliveryJob.perform_later(notification.id)
        NotificationMailer.with(notification: notification).event.deliver_later
        notification
      end

      def money(cents)
        value = BigDecimal(cents.abs.to_s) / 100
        formatted = ActiveSupport::NumberHelper.number_to_delimited(
          value == value.to_i ? value.to_i : value.round(2)
        )
        "#{"− " if cents.negative?}Nu. #{formatted}"
      end

      def pluralize_months(months)
        months == 1 ? "1 month" : "#{months} months"
      end
  end
end
