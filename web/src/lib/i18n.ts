// The customer-facing strings, from the Rails config/locales. Anything not
// translated falls back to English, so a half-finished Dzongkha file is
// usable rather than broken.

import { useQuery } from "@tanstack/react-query"

import type { Locale } from "@/api/types"
import { meQuery } from "@/lib/me"

const en = {
  "language.name": "English",
  "language.choose": "Language",
  "language.hint": "Anything not yet translated is shown in English.",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.back": "Back",
  "common.optional": "Optional",
  "common.settled": "Settled",
  "common.overdue": "Overdue",
  "common.owes": "Owes",
  "common.advance": "Advance",
  "common.pending": "Pending",
  "common.confirmed": "Confirmed",
  "common.rejected": "Rejected",
  "nav.home": "Home",
  "nav.alerts": "Alerts",
  "nav.shops": "Shops",
  "shops.card_title": "Browse shops",
  "shops.card_body": "See what shops near you sell, and at what price.",
  "nav.customers": "Customers",
  "nav.settings": "Settings",
  "nav.profile": "Profile",
  "nav.notifications": "Notifications",
  "nav.your_account": "Your account",
  "nav.sign_out": "Sign out",
  "offline.banner":
    "You are offline — showing the last data this device loaded. Credits and payments you record are kept on this phone and sent when the signal is back.",
  "customer_home.title": "My credit",
  "customer_home.total_label": "Your total balance",
  "customer_home.outstanding_across": "Outstanding across %{count} shop",
  "customer_home.outstanding_across_plural": "Outstanding across %{count} shops",
  "customer_home.all_settled": "You are all settled",
  "customer_home.shops": "Shops",
  "customer_home.taken_this_month": "Taken this month",
  "customer_home.my_accounts": "My accounts",
  "customer_home.recent_activity": "Recent activity",
  "customer_home.no_shops_title": "No shops yet",
  "customer_home.no_shops_body": "Ask your shopkeeper for their Bangkee invite link.",
  "customer_home.credit_account": "Credit account",
  "account.you_owe": "You owe this shop",
  "account.paid_in_advance": "Paid in advance",
  "account.settled_nothing_owed": "Settled — nothing owed",
  "account.days_overdue": "%{count} days overdue",
  "account.statement": "Statement",
  "account.how_to_pay": "How to pay %{shop}",
  "account.account_name": "Account name",
  "account.account_number": "Account number",
  "account.branch": "Branch",
  "account.transaction_history": "Transaction history",
  "account.nothing_recorded_title": "Nothing recorded yet",
  "account.nothing_recorded_body": "When the shop adds something to your book it appears here.",
  "notifications.title": "Notifications",
  "notifications.mark_all_read": "Mark all read",
  "notifications.empty_title": "Nothing yet",
  "notifications.empty_body": "Credits, payments and reminders show up here.",
  "notifications.ago": "%{time} ago",
} as const

export type TKey = keyof typeof en

// Translations have to come from a Dzongkha speaker, not from a guess.
const dz: Partial<Record<TKey, string>> = {
  "language.name": "རྫོང་ཁ",
}

export const LOCALES: Locale[] = ["en", "dz"]
const STORAGE_KEY = "bangkee.locale"

export function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === "en" || value === "dz" ? value : null
  } catch {
    return null
  }
}

export function storeLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* private mode */
  }
}

export function translate(locale: Locale, key: TKey, vars: Record<string, string | number> = {}): string {
  let resolved: TKey = key
  // Rails pluralisation: `_plural` when count is not 1, if such a key exists.
  if (typeof vars.count === "number" && vars.count !== 1 && `${key}_plural` in en) resolved = `${key}_plural` as TKey
  const template = (locale === "dz" ? dz[resolved] : undefined) ?? en[resolved]
  return template.replace(/%\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""))
}

/** The reading language: the signed-in person's, else this device's choice. */
export function useLocale(): Locale {
  const { data } = useQuery(meQuery)
  return data?.user.locale ?? storedLocale() ?? "en"
}

export function useT() {
  const locale = useLocale()
  return (key: TKey, vars?: Record<string, string | number>) => translate(locale, key, vars)
}

export function languageName(locale: Locale) {
  return translate(locale, "language.name")
}
