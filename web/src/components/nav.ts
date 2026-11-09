import {
  BarChart3Icon,
  BellIcon,
  BellRingIcon,
  HouseIcon,
  InboxIcon,
  LayoutGridIcon,
  MessageSquareQuoteIcon,
  ReceiptTextIcon,
  SettingsIcon,
  StoreIcon,
  TruckIcon,
  UserRoundIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react"

import type { Me } from "@/api/types"
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
  if (me.user.platform_admin) {
    return [
      { label: "Overview", icon: LayoutGridIcon, path: "/dashboard", key: "admin" },
      { label: "Payments", icon: ReceiptTextIcon, path: "/subscription_payments", key: "admin_payments", badge: me.badges.admin_payments },
      { label: "Feedback", icon: InboxIcon, path: "/feedback", key: "admin_feedback", badge: me.badges.admin_feedback },
      { label: "Testimonials", icon: MessageSquareQuoteIcon, path: "/testimonials", key: "admin_testimonials", badge: me.badges.admin_testimonials },
      { label: "Shops", icon: StoreIcon, path: "/all_shops", key: "admin_shops" },
      { label: "Settings", icon: SettingsIcon, path: "/settings", key: "settings" },
    ]
  }
  if (me.user.role === "shop_owner" || me.user.role === "staff") {
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

/**
 * The shop's business tools, for the desktop sidebar under their own heading:
 * the bottom tab bar on a phone has no room for them, so on a phone they stay
 * in Profile. Each shows only to whoever may use it.
 */
export function businessItems(me: Me): NavItem[] {
  if (!me.shop || (me.user.role !== "shop_owner" && me.user.role !== "staff")) return []
  const items: NavItem[] = []
  if (me.permissions.includes("view")) items.push({ label: "Suppliers", icon: TruckIcon, path: "/suppliers", key: "suppliers" })
  if (me.permissions.includes("owner")) {
    items.push({ label: "Reminders", icon: BellRingIcon, path: "/reminders", key: "reminders" })
    items.push({ label: "Staff", icon: UsersRoundIcon, path: "/staff", key: "staff" })
  }
  return items
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
  shop_profile: "settings",
  settings: "settings",
  bank_accounts: "settings",
  subscription: "settings",
  notifications: "notifications",
  shops: "shops",
  help: "settings",
  testimonial: "settings",
  suppliers: "suppliers",
  reminders: "reminders",
  staff: "staff",
}

export function navRoot(pathname: string, me: Me): string | undefined {
  const [first = ""] = pathname.split("/").filter(Boolean)
  if (me.user.platform_admin) {
    if (first === "dashboard") return "admin"
    if (first === "subscription_payments") return "admin_payments"
    if (first === "all_shops") return "admin_shops"
    if (first === "feedback") return "admin_feedback"
    if (first === "testimonials") return "admin_testimonials"
    return first === "settings" ? "settings" : undefined
  }
  // A customer's account screens hang off their own home.
  if (me.user.role === "customer" && first === "accounts") return "dashboard"
  return NAV_ROOTS[first]
}
