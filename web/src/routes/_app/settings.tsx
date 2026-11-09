import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  BellIcon,
  BellRingIcon,
  CheckIcon,
  ChevronRightIcon,
  CrownIcon,
  LandmarkIcon,
  LifeBuoyIcon,
  MessageSquareQuoteIcon,
  LogOutIcon,
  MonitorSmartphoneIcon,
  NotebookTextIcon,
  SmartphoneIcon,
  StoreIcon,
  TruckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import { api } from "@/api/client"
import type { Locale } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { Panel, Row, Rows } from "@/components/kit"
import { PhotoUpload } from "@/components/photo-upload"
import { InstallCard } from "@/components/pwa"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { flashNotice } from "@/lib/flash"
import { isAdminHost } from "@/lib/host"
import { languageName, LOCALES, storeLocale, translate, useLocale, useT } from "@/lib/i18n"
import { useMe } from "@/lib/me"
import { pluralize } from "@/lib/money"
import { usePage } from "@/lib/page"
import { enablePush, pushStatusStore } from "@/lib/pwa"
import { refreshAll } from "@/lib/query"
import { signOut } from "@/lib/session"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/settings")({ component: Settings })

const STAFF_TITLE: Record<string, string> = { manager: "manager", cashier: "cashier", viewer: "staff (read only)" }

function Tile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center text-foreground">
      <Icon className="size-5" strokeWidth={1.75} />
    </span>
  )
}

/** A group's heading, above its card. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="px-1 text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

// The person's own screen — Profile in the tab bar: who they are, then
// everything that isn't the ledger: billing, the shop, its items and bank
// details, language, notifications, installing the app, and signing out. In the
// console it is only the person: who they are, their language, signing out.
function Settings() {
  usePage(isAdminHost() ? "Settings" : "Profile")
  const me = useMe()
  const t = useT()
  const current = useLocale()
  const console = isAdminHost()
  const info = useQuery({ queryKey: ["settings"], queryFn: api.settings, enabled: !console })
  const pushStatus = pushStatusStore.use()

  const language = useMutation({
    mutationFn: (locale: Locale) => {
      storeLocale(locale)
      return api.setLanguage(locale)
    },
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })

  if (!me) return null
  const { user, shop, subscription, push } = me
  // Billing, bank details, the shop's profile and settings, and the staff are the owner's alone.
  const owns = me.permissions.includes("owner")

  const pushText = !push.configured
    ? "Not configured on this server yet."
    : push.devices > 0
      ? `On for ${pluralize(push.devices, "device")}.`
      : "Get a note when a payment or credit lands — even when Bangkee is closed."

  // A desktop keeps who you are on the left and the settings on the right.
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-5 xl:max-w-none xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start xl:gap-8">
      <div className="grid gap-5 xl:sticky xl:top-24">
        <div className="flex flex-col items-center pt-2 text-center xl:rounded-[1.25rem] xl:border xl:bg-card xl:px-5 xl:pt-8 xl:pb-6">
          <PhotoUpload current={user.photo_url} fallback={user.initial} label="a profile photo" className="size-24 text-base" onSave={api.setMyPhoto} onRemove={api.removeMyPhoto} />
          <div className="mt-3 text-xl font-semibold tracking-tight">{user.display_name}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{user.email_address ?? user.phone}</div>
          <div className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            {user.platform_admin ? "Bangkee operator" : shop ? `${shop.name} · ${me.shop_role === "owner" ? "shop owner" : (STAFF_TITLE[me.shop_role] ?? "staff")}` : "Customer"}
          </div>
        </div>

        {shop && !console && owns && (
          <AppLink
            href="/subscription"
            className="relative flex items-center gap-3 overflow-hidden rounded-[1.25rem] bg-[linear-gradient(120deg,oklch(0.5_0.26_277),oklch(0.6_0.2_266))] p-4 text-white shadow-lg shadow-primary/25"
          >
            <span aria-hidden="true" className="absolute -top-10 -right-6 size-32 rounded-full bg-white/15 blur-2xl" />
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <CrownIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-semibold">
                Bangkee for {shop.name}
                {subscription && <span className="rounded-md bg-white px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-primary uppercase">{subscription.status_label}</span>}
              </span>
              <span className="block truncate text-sm text-white/80">{subscription?.summary ?? "Billing and payments"}</span>
            </span>
            <ChevronRightIcon className="size-5 shrink-0" />
          </AppLink>
        )}

        {!console && <InstallCard />}
      </div>

      <div className="grid gap-5">
        {shop && !console && (
          <Section title="Shop">
            <Panel flush>
              <Rows>
                {owns && (
                  <Row
                    href="/shop_profile"
                    leading={<Tile icon={StoreIcon} />}
                    title="Shop profile"
                    subtitle={shop.kind ? "What customers read about your shop" : "Add your type, location and hours"}
                    chevron
                  />
                )}
                <Row href="/menu_items" leading={<Tile icon={NotebookTextIcon} />} title="Items" subtitle={`${pluralize(info.data?.menu_items_count ?? 0, "item")} you sell`} chevron />
                {owns && (
                  <Row href="/bank_accounts" leading={<Tile icon={LandmarkIcon} />} title="Bank details" subtitle={`${pluralize(info.data?.bank_accounts_count ?? 0, "account")} published`} chevron />
                )}
                <Row href="/suppliers" leading={<Tile icon={TruckIcon} />} title="Suppliers" subtitle="What you owe the people you buy from" chevron />
                {owns && <Row href="/reminders" leading={<Tile icon={BellRingIcon} />} title="Reminders" subtitle="Reminding overdue customers, and when" chevron />}
                {owns && <Row href="/staff" leading={<Tile icon={UsersIcon} />} title="Staff" subtitle="The people who record entries with you" chevron />}
              </Rows>
            </Panel>
          </Section>
        )}

        <Section title={t("language.choose")}>
          <Panel flush>
            <div role="radiogroup" aria-label={t("language.choose")} className="divide-y">
              {LOCALES.map((locale) => {
                const selected = current === locale
                return (
                  <button
                    key={locale}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 sm:px-5"
                    onClick={() => language.mutate(locale)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{languageName(locale)}</span>
                      {locale === "dz" && <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">{translate(current, "language.hint")}</span>}
                    </span>
                    <span className={cn("flex size-5 items-center justify-center rounded-full border", selected && "border-primary bg-primary text-primary-foreground")}>
                      {selected && <CheckIcon className="size-3" strokeWidth={3} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </Panel>
        </Section>

        {!console && (
          <Section title="Help & feedback">
            <Panel flush>
              <Rows>
                <Row href="/help" leading={<Tile icon={LifeBuoyIcon} />} title="Help & feedback" subtitle="Feedback, a feature you'd like, or help with a problem" chevron />
                <Row href="/testimonial" leading={<Tile icon={MessageSquareQuoteIcon} />} title="Share your experience" subtitle="A few words for the Bangkee homepage" chevron />
              </Rows>
            </Panel>
          </Section>
        )}

        <Section title="Notifications">
          <Panel flush>
            <Rows>
              <Row
                leading={<Tile icon={BellRingIcon} />}
                title="Push notifications"
                subtitle={<span className="whitespace-normal">{pushStatus ?? pushText}</span>}
                trailing={
                  push.configured && (
                    <Button variant="outline" size="sm" onClick={() => void enablePush()}>
                      {push.devices > 0 ? "Add this device" : "Turn on"}
                    </Button>
                  )
                }
              />
              {me.user.role === "customer" && <ReminderOptOut optOut={me.user.reminders_opt_out} />}
              <Row
                href="/notifications"
                leading={<Tile icon={BellIcon} />}
                title="Notification centre"
                subtitle={me.unread_notifications > 0 ? `${me.unread_notifications} unread` : "Everything read"}
                trailing={
                  me.unread_notifications > 0 && (
                    <span className="tabular flex size-6 items-center justify-center rounded-full bg-owed text-xs font-semibold text-white">{me.unread_notifications}</span>
                  )
                }
                chevron
              />
            </Rows>
          </Panel>
        </Section>

        {!console && (
          <Section title="Installing Bangkee">
            <Panel flush>
              <div className="divide-y">
                <Guide icon={SmartphoneIcon} title="On Android">
                  Chrome menu → “Install app” — or use the Install button when it appears.
                </Guide>
                <Guide icon={MonitorSmartphoneIcon} title="On iPhone">
                  Safari cannot install by itself: tap Share, then “Add to Home Screen”. Notifications on iOS only work once Bangkee is on the home screen.
                </Guide>
              </div>
            </Panel>
          </Section>
        )}

        <Button variant="outline" size="xl" className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => void signOut()}>
          <LogOutIcon /> Sign out
        </Button>
      </div>
    </div>
  )
}

function Guide({ icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <Tile icon={icon} />
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

/** A customer's own switch: shops' payment reminders through Bangkee, on or off. */
function ReminderOptOut({ optOut }: { optOut: boolean }) {
  const toggle = useMutation({
    mutationFn: (off: boolean) => api.setMyReminders(off),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })
  return (
    <Row
      leading={<Tile icon={BellIcon} />}
      title="Payment reminders"
      subtitle={<span className="whitespace-normal">{optOut ? "Off — shops cannot remind you through Bangkee" : "Shops can remind you when a balance is overdue"}</span>}
      trailing={<Switch checked={!optOut} disabled={toggle.isPending} onCheckedChange={(on) => toggle.mutate(!on)} aria-label="Payment reminders" />}
    />
  )
}
