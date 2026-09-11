module ApplicationHelper
  # BR-3. Whole amounts drop the decimals ("Nu. 1,250"); fractional amounts
  # keep two. A negative balance is shown with a real minus sign.
  def ngultrum(cents, signed: false)
    cents = cents.to_i
    value = BigDecimal(cents.abs.to_s) / 100
    precision = (value == value.to_i) ? 0 : 2
    formatted = number_to_currency(value, unit: "Nu. ", precision: precision, delimiter: ",")
    prefix = if signed
      cents.positive? ? "+ " : (cents.negative? ? "− " : "")
    else
      cents.negative? ? "− " : ""
    end
    "#{prefix}#{formatted}"
  end

  # owed / paid / settled — the colour classes carry the ledger's meaning.
  def balance_state(cents)
    return "owed" if cents.to_i.positive?
    return "paid" if cents.to_i.negative?
    "settled"
  end

  def balance_word(account)
    return account.overdue? ? "Overdue" : "Owes" if account.balance_cents.positive?
    return "Advance" if account.balance_cents.negative?
    "Settled"
  end

  def balance_badge_class(account)
    return account.overdue? ? "badge--overdue" : "badge--credit" if account.balance_cents.positive?
    return "badge--advance" if account.balance_cents.negative?
    "badge--settled"
  end

  # One sentence describing where a shop stands with its subscription. Used in
  # three places, so it lives here rather than as a case block inside ERB.
  def subscription_summary(subscription)
    return "No subscription" if subscription.nil?

    case subscription.effective_status
    when :trialing then "#{pluralize subscription.days_remaining, "day"} of free trial left"
    when :active   then "Renews #{subscription.current_period_end.to_date.strftime("%-d %b %Y")}"
    when :past_due then "#{pluralize subscription.grace_days_remaining, "day"} left before writing is locked"
    else "Write actions are locked"
    end
  end

  def subscription_badge_class(subscription)
    { trialing: "badge--brand", active: "badge--advance",
      past_due: "badge--pending", disabled: "badge--credit" }[subscription&.effective_status] || "badge--settled"
  end

  # Naming a shop is enough to pick it, unless the customer somehow keeps two
  # books at the same shop — then the name on the account is what tells them
  # apart.
  def account_choice_label(account, accounts)
    duplicate_shop = accounts.count { |other| other.shop_id == account.shop_id } > 1
    name = duplicate_shop ? "#{account.shop.name} · #{account.display_name}" : account.shop.name

    "#{name} — #{ngultrum account.balance_cents} owed"
  end

  def page_title(title, back: nil)
    @page_title = title
    @back_path = back
    content_for(:title) { "#{title} · Bangkee" }
    title
  end

  ICONS = {
    home:    [ "M3 11l9-8 9 8", "M5 10v11h14V10" ],
    users:   [ "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M2.5 20c0-3.6 3-5.8 6.5-5.8s6.5 2.2 6.5 5.8",
               "M15 11a3 3 0 1 0-1.2-5.8", "M17 14.4c2.5.5 4.5 2.3 4.5 5.1" ],
    receipt: [ "M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3z", "M9 8h6", "M9 12h6" ],
    gear:    [ "M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z", "M12 2.8v2.4", "M12 18.8v2.4", "M2.8 12h2.4",
               "M18.8 12h2.4", "M5.2 5.2l1.7 1.7", "M17.1 17.1l1.8 1.8", "M18.8 5.2l-1.7 1.7", "M6.9 17.1l-1.8 1.8" ],
    grid:    [ "M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z" ],
    bell:    [ "M6 16v-5a6 6 0 0 1 12 0v5l2 3H4l2-3z", "M10 21a2.5 2.5 0 0 0 4 0" ],
    plus:    [ "M12 5v14", "M5 12h14" ],
    chev_right: [ "M9 5l7 7-7 7" ],
    chev_left:  [ "M15 5l-7 7 7 7" ],
    chev_down:  [ "M6 9l6 6 6-6" ],
    wifi_off: [ "M2 8.5a15 15 0 0 1 20 0", "M5.5 12.5a10 10 0 0 1 13 0", "M9 16.5a5 5 0 0 1 6 0", "M3 3l18 18" ],
    check:   [ "M20 6L9 17l-5-5" ],
    close:   [ "M18 6L6 18", "M6 6l12 12" ],
    share:   [ "M12 16V4", "M8 8l4-4 4 4", "M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" ],
    print:   [ "M6 9V3h12v6", "M6 18H4v-7h16v7h-2", "M8 14h8v7H8z" ],
    camera:  [ "M4 8h3l2-2h6l2 2h3v12H4z", "M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" ],
    bank:    [ "M3 10l9-6 9 6", "M5 10v10h14V10", "M9 20v-6h6v6" ],
    table:   [ "M3 9h18", "M5 9V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3", "M7 9v10", "M17 9v10", "M3 14h18" ],
    logout:  [ "M15 4h4v16h-4", "M11 8l-4 4 4 4", "M7 12h8" ]
  }.freeze

  def icon(name, size: 22, stroke: 2)
    paths = ICONS.fetch(name.to_sym)
    tag.svg(width: size, height: size, viewBox: "0 0 24 24", fill: "none",
            stroke: "currentColor", "stroke-width": stroke,
            "stroke-linecap": "round", "stroke-linejoin": "round",
            "aria-hidden": true) do
      safe_join(paths.map { |d| tag.path(d: d) })
    end
  end

  # The destinations in the sidebar and the bottom tab bar — the same list, so
  # the two navigations can never drift apart.
  def nav_items
    if current_user.platform_admin?
      [ { label: "Overview", icon: :grid,    path: admin_root_path, key: "admin" },
        { label: "Payments", icon: :receipt, path: admin_subscription_payments_path, key: "admin_payments",
          badge: SubscriptionPayment.pending.count },
        { label: "Shops",    icon: :home,    path: admin_shops_path, key: "admin_shops" } ]
    elsif current_user.shop_owner?
      [ { label: "Home",      icon: :home,    path: dashboard_path, key: "dashboard" },
        { label: "Tabs",      icon: :table,   path: tabs_path, key: "tabs",
          badge: current_shop&.tabs&.open&.count.to_i },
        { label: "Customers", icon: :users,   path: accounts_path,  key: "accounts" },
        { label: "Proofs",    icon: :receipt, path: payment_proofs_path, key: "payment_proofs",
          badge: current_shop&.payment_proofs&.pending&.count.to_i },
        { label: "Settings",  icon: :gear,    path: settings_path, key: "settings" } ]
    else
      [ { label: "Home",   icon: :home, path: dashboard_path, key: "dashboard" },
        { label: "Alerts", icon: :bell, path: notifications_path, key: "notifications",
          badge: unread_notifications_count } ]
    end
  end

  # Which nav item owns the screen we are on — so a child screen still lights
  # up its parent tab.
  NAV_ROOTS = {
    "dashboards" => "dashboard", "accounts" => "accounts", "credits" => "accounts",
    "tabs" => "tabs", "tab_items" => "tabs",
    "payments" => "accounts", "transactions" => "accounts", "statements" => "accounts",
    "invites" => "accounts", "payment_proofs" => "payment_proofs",
    "settings" => "settings", "bank_accounts" => "settings", "subscriptions" => "settings",
    "subscription_payments" => "settings", "notifications" => "notifications",
    "admin/dashboard" => "admin", "admin/subscription_payments" => "admin_payments",
    "admin/shops" => "admin_shops"
  }.freeze

  def nav_root
    key = controller_path
    # A customer's payment_proofs screens hang off their own home.
    return "dashboard" if current_user&.customer? && key == "payment_proofs"
    NAV_ROOTS[key]
  end
end
