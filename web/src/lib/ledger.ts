import type { AccountSummary } from "@/api/types"
import type { BadgeVariant } from "@/components/ui/badge"
import type { TKey } from "@/lib/i18n"

type T = (key: TKey, vars?: Record<string, string | number>) => string

/** Owes / Overdue / Advance / Settled — the account's badge word. */
export function balanceWord(account: AccountSummary, t: T): string {
  if (account.balance_cents > 0) return account.overdue ? t("common.overdue") : t("common.owes")
  if (account.balance_cents < 0) return t("common.advance")
  return t("common.settled")
}

export function balanceBadge(account: AccountSummary): BadgeVariant {
  if (account.balance_cents > 0) return account.overdue ? "warn" : "owed"
  if (account.balance_cents < 0) return "paid"
  return "muted"
}

/** A billing payment's review state, as a badge: waiting amber, accepted green, refused red. */
export function reviewBadge(status: string): BadgeVariant {
  if (status === "confirmed" || status === "approved") return "paid"
  if (status === "rejected") return "owed"
  return "warn"
}
