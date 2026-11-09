import {
  BarChart3Icon,
  BellIcon,
  BellRingIcon,
  CreditCardIcon,
  LandmarkIcon,
  LifeBuoyIcon,
  PackageIcon,
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
  ShoppingBagIcon,
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
 * The rest of a shop's work, in the desktop sidebar under headings, so a
 * shopkeeper sees it without opening Profile. (A phone's tab bar has no room:
 * there the Home screen's Shop panel carries the same links.) Each shows only
 * to whoever may use it.
 */
export function sidebarSections(me: Me): { label: string; items: NavItem[] }[] {
  if (!me.shop || (me.user.role !== "shop_owner" && me.user.role !== "staff")) return []
  const can = (p: string) => me.permissions.includes(p as never)
  const shop: NavItem[] = []
  if (can("view")) shop.push({ label: "Items", icon: PackageIcon, path: "/menu_items", key: "items" })
  if (can("owner")) {
    shop.push({ label: "Shop profile", icon: StoreIcon, path: "/shop_profile", key: "shop_profile" })
    shop.push({ label: "Bank details", icon: LandmarkIcon, path: "/bank_accounts", key: "bank_accounts" })
    shop.push({ label: "Billing", icon: CreditCardIcon, path: "/subscription", key: "billing" })
  }
  const business: NavItem[] = []
  if (can("view")) business.push({ label: "Suppliers", icon: TruckIcon, path: "/suppliers", key: "suppliers" })
  if (can("owner")) {
    business.push({ label: "Reminders", icon: BellRingIcon, path: "/reminders", key: "reminders" })
    business.push({ label: "Staff", icon: UsersRoundIcon, path: "/staff", key: "staff" })
  }
  return [
    { label: "Shop", items: shop },
    { label: "Business", items: business },
  ].filter((section) => section.items.length > 0)
}

/** Help, at the foot of a shop's sidebar. */
/** Sales paid on the spot: beside Customers in the desktop sidebar; on a phone, behind + and on Home. */
export const salesItem: NavItem = { label: "Sales", icon: ShoppingBagIcon, path: "/sales", key: "sales" }

export const helpItem: NavItem = { label: "Help & feedback", icon: LifeBuoyIcon, path: "/help", key: "help" }

// Which nav item owns the screen we are on — so a child screen still lights
// up its parent tab.
const NAV_ROOTS: Record<string, string> = {
  dashboard: "dashboard",
  accounts: "accounts",
  transactions: "accounts",
  insights: "insights",
  record: "accounts",
  menu_items: "items",
  shop_profile: "shop_profile",
  settings: "settings",
  bank_accounts: "bank_accounts",
  subscription: "billing",
  notifications: "notifications",
  shops: "shops",
  help: "help",
  testimonial: "settings",
  suppliers: "suppliers",
  reminders: "reminders",
  staff: "staff",
  sales: "sales",
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
