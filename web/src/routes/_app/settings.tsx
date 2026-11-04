import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  BellIcon,
  BellRingIcon,
  CheckIcon,
  CreditCardIcon,
  LandmarkIcon,
  LogOutIcon,
  MonitorSmartphoneIcon,
  NotebookTextIcon,
  SmartphoneIcon,
  StoreIcon,
  type LucideIcon,
} from "lucide-react"

import { api } from "@/api/client"
import type { Locale } from "@/api/types"
import { Initial, Panel, Row, Rows } from "@/components/kit"
import { InstallCard } from "@/components/pwa"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
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

function Tile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-[1.125rem]" />
    </span>
  )
}

// One screen for everything that isn't the ledger: the shop, billing, bank
// details, notifications, installing the app, and signing out. In the
// console it is only the person: who they are, their language, signing out.
function Settings() {
  usePage("Settings", undefined, { narrow: true })
  const me = useMe()
  const t = useT()
  const current = useLocale()
  const console = isAdminHost()
  const info = useQuery({ queryKey: ["settings"], queryFn: api.settings, enabled: !console })
  const pushStatus = pushStatusStore.use()

  const kind = useMutation({
    mutationFn: (value: string) => api.setShopKind(value),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })

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

  const pushText = !push.configured
    ? "Not configured on this server yet."
    : push.devices > 0
      ? `On for ${pluralize(push.devices, "device")}.`
      : "Get a note when a payment or credit lands — even when Bangkee is closed."

  return (
    <div className="grid gap-5">
      <Panel>
        <div className="flex items-center gap-4">
          <Initial text={user.initial} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold tracking-tight">{user.display_name}</div>
            <div className="truncate text-sm text-muted-foreground">{user.email_address ?? user.phone}</div>
            <div className="mt-1 text-[0.8125rem] text-muted-foreground">{user.platform_admin ? "Bangkee operator" : shop ? `${shop.name} · shop owner` : "Customer"}</div>
          </div>
        </div>
      </Panel>

      {!console && <InstallCard />}

      {shop && !console && (
        <Panel flush title="Shop">
          <Rows>
            <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Tile icon={StoreIcon} />
              <label htmlFor="shop_kind" className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Type of business</span>
                <span className="block text-[0.8125rem] text-muted-foreground">Customers find you by it when they browse shops</span>
              </label>
              <NativeSelect id="shop_kind" className="w-36" value={shop.kind ?? ""} disabled={kind.isPending} onChange={(e) => kind.mutate(e.target.value)}>
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {(info.data?.shop_kinds ?? []).map((k) => (
                  <NativeSelectOption key={k.key} value={k.key}>
                    {k.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Row href="/subscription" leading={<Tile icon={CreditCardIcon} />} title="Billing" subtitle={subscription ? `${subscription.status_label} · ${subscription.summary}` : "No subscription"} chevron />
            <Row href="/menu_items" leading={<Tile icon={NotebookTextIcon} />} title="Items" subtitle={`${pluralize(info.data?.menu_items_count ?? 0, "item")} you sell`} chevron />
            <Row href="/bank_accounts" leading={<Tile icon={LandmarkIcon} />} title="Bank details" subtitle={`${pluralize(info.data?.bank_accounts_count ?? 0, "account")} published`} chevron />
          </Rows>
        </Panel>
      )}

      <Panel flush title={t("language.choose")}>
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

      <Panel flush title="Notifications">
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
          <Row href="/notifications" leading={<Tile icon={BellIcon} />} title="Notification centre" subtitle={me.unread_notifications > 0 ? `${me.unread_notifications} unread` : "Everything read"} chevron />
        </Rows>
      </Panel>

      {!console && (
        <Panel flush title="Installing Bangkee">
          <div className="divide-y">
            <Guide icon={SmartphoneIcon} title="On Android">
              Chrome menu → “Install app” — or use the Install button when it appears.
            </Guide>
            <Guide icon={MonitorSmartphoneIcon} title="On iPhone">
              Safari cannot install by itself: tap Share, then “Add to Home Screen”. Notifications on iOS only work once Bangkee is on the home screen.
            </Guide>
          </div>
        </Panel>
      )}

      <Button variant="outline" size="lg" className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => void signOut()}>
        <LogOutIcon /> Sign out
      </Button>
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
