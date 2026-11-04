import { BarChart3Icon, BellIcon, HouseIcon, InboxIcon, LayoutGridIcon, ReceiptTextIcon, SettingsIcon, StoreIcon, UserRoundIcon, UsersIcon, type LucideIcon } from "lucide-react"

import type { Me } from "@/api/types"
import { isAdminHost } from "@/lib/host"
import { translate } from "@/lib/i18n"

export interface NavItem {
  label: string
  icon: LucideIcon
  path: string
  key: string
  badge?: number
}

// The destinations in the sidebar and the bottom tab bar — the same list, so
// the two navigations can never drift apart. A shop owner's tab bar also has
// the round + in its middle (shell.tsx): recording is what they do most.
export function navItems(me: Me): NavItem[] {
  if (isAdminHost()) {
    return [
      { label: "Overview", icon: LayoutGridIcon, path: "/", key: "admin" },
      { label: "Payments", icon: ReceiptTextIcon, path: "/subscription_payments", key: "admin_payments", badge: me.badges.admin_payments },
      { label: "Feedback", icon: InboxIcon, path: "/feedback", key: "admin_feedback", badge: me.badges.admin_feedback },
      { label: "Shops", icon: StoreIcon, path: "/shops", key: "admin_shops" },
      { label: "Settings", icon: SettingsIcon, path: "/settings", key: "settings" },
    ]
  }
  if (me.user.role === "shop_owner") {
    return [
      { label: "Home", icon: HouseIcon, path: "/dashboard", key: "dashboard" },
      { label: "Customers", icon: UsersIcon, path: "/accounts", key: "accounts" },
      { label: "Insights", icon: BarChart3Icon, path: "/insights", key: "insights" },
      { label: "Profile", icon: UserRoundIcon, path: "/settings", key: "settings" },
    ]
  }
  const locale = me.user.locale ?? "en"
  return [
    { label: translate(locale, "nav.home"), icon: HouseIcon, path: "/dashboard", key: "dashboard" },
    { label: translate(locale, "nav.shops"), icon: StoreIcon, path: "/shops", key: "shops" },
    { label: translate(locale, "nav.alerts"), icon: BellIcon, path: "/notifications", key: "notifications", badge: me.unread_notifications },
    { label: translate(locale, "nav.profile"), icon: UserRoundIcon, path: "/settings", key: "settings" },
  ]
}

// Which nav item owns the screen we are on — so a child screen still lights
// up its parent tab.
const NAV_ROOTS: Record<string, string> = {
  dashboard: "dashboard",
  accounts: "accounts",
  transactions: "accounts",
  insights: "insights",
  record: "accounts",
  menu_items: "settings",
  settings: "settings",
  bank_accounts: "settings",
  subscription: "settings",
  notifications: "notifications",
  shops: "shops",
  help: "settings",
}

export function navRoot(pathname: string, me: Me): string | undefined {
  const [first = ""] = pathname.split("/").filter(Boolean)
  if (isAdminHost()) {
    if (first === "") return "admin"
    if (first === "subscription_payments") return "admin_payments"
    if (first === "shops") return "admin_shops"
    if (first === "feedback") return "admin_feedback"
    return first === "settings" ? "settings" : undefined
  }
  // A customer's account screens hang off their own home.
  if (me.user.role === "customer" && first === "accounts") return "dashboard"
  return NAV_ROOTS[first]
}
