import { Link } from "@tanstack/react-router"
import { CircleAlertIcon, CircleCheckIcon, ClockAlertIcon, WifiOffIcon, XIcon, type LucideIcon } from "lucide-react"

import type { Me } from "@/api/types"
import { flashStore } from "@/lib/flash"
import { useT } from "@/lib/i18n"
import { pluralize } from "@/lib/money"
import { useOnline } from "@/lib/online"
import { cn } from "@/lib/utils"

const TONES = {
  ok: "border-paid/20 bg-paid/[0.07] [&>svg]:text-paid",
  alert: "border-destructive/25 bg-destructive/[0.06] [&>svg]:text-destructive",
  warn: "border-warn/30 bg-warn/[0.09] [&>svg]:text-warn",
} as const

/** One strip of news above the screen: what just happened, or what is wrong. */
export function Banner({ tone, icon: Icon, children, action, onClose }: { tone: keyof typeof TONES; icon: LucideIcon; children: React.ReactNode; action?: React.ReactNode; onClose?: () => void }) {
  return (
    <div role={tone === "ok" ? "status" : "alert"} className={cn("no-print flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm", TONES[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {action && <div className="shrink-0 font-medium text-primary">{action}</div>}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}

export function OfflineBanner() {
  const online = useOnline()
  const t = useT()
  if (online) return null
  return (
    <Banner tone="warn" icon={WifiOffIcon}>
      {t("offline.banner")}
    </Banner>
  )
}

// As internal/domain TrialEndingDays: when the trial-ending note goes out.
const TRIAL_ENDING_DAYS = 3

export function SubscriptionBanner({ me }: { me: Me }) {
  const subscription = me.subscription
  if (!subscription) return null
  // The last few days of the free trial: time to pay before it lapses.
  if (subscription.status === "trialing" && subscription.days_remaining <= TRIAL_ENDING_DAYS) {
    return (
      <Banner tone="warn" icon={ClockAlertIcon} action={<Link to="/subscription">Pay now</Link>}>
        Your free trial ends in <strong className="font-semibold">{pluralize(subscription.days_remaining, "day")}</strong>. Pay for a year to keep recording.
      </Banner>
    )
  }
  if (subscription.status === "past_due") {
    return (
      <Banner tone="warn" icon={ClockAlertIcon} action={<Link to="/subscription">Pay now</Link>}>
        Your subscription has lapsed — <strong className="font-semibold">{pluralize(subscription.grace_days_remaining, "day")}</strong> left before writing is locked.
      </Banner>
    )
  }
  if (subscription.status === "disabled") {
    return (
      <Banner tone="alert" icon={CircleAlertIcon} action={<Link to="/subscription">Restore access</Link>}>
        Your subscription is inactive — recording credits and payments is locked.
      </Banner>
    )
  }
  return null
}

export function FlashBanners() {
  const flash = flashStore.use()
  return (
    <>
      {flash.notice && (
        <Banner tone="ok" icon={CircleCheckIcon} onClose={() => flashStore.set({})}>
          {flash.notice}
        </Banner>
      )}
      {flash.alert && (
        <Banner tone="alert" icon={CircleAlertIcon} onClose={() => flashStore.set({})}>
          {flash.alert}
        </Banner>
      )}
    </>
  )
}
