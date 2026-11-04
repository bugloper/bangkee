import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CreditCardIcon,
  LandmarkIcon,
  PlusIcon,
  PackageIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  StoreIcon,
} from "lucide-react"

import { api } from "@/api/client"
import type { CustomerDashboard, LedgerEntry, Me, OwnerDashboard } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { Loading } from "@/components/form"
import { Count, Empty, Initial, Money, Panel, Row, Rows, Stat, StatGrid } from "@/components/kit"
import { InstallCard } from "@/components/pwa"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { adminOrigin } from "@/lib/host"
import { useT } from "@/lib/i18n"
import { balanceBadge, balanceWord } from "@/lib/ledger"
import { useMe } from "@/lib/me"
import { ngultrum, pluralize } from "@/lib/money"
import { usePage } from "@/lib/page"
import { dayMonth, timeAgoInWords } from "@/lib/time"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard })

function Dashboard() {
  const me = useMe()
  const staff = me?.user.platform_admin ?? false
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, enabled: !!me && !staff })
  if (staff) return <StaffNotice />
  if (!data || !me) return <Loading />
  return data.kind === "owner" ? <Owner data={data} me={me} /> : <Customer data={data} />
}

// Staff work in the console, at its own address; there is nothing of theirs here.
function StaffNotice() {
  usePage("Bangkee")
  return (
    <Panel>
      <Empty
        icon={ShieldCheckIcon}
        title="You're signed in as Bangkee staff"
        action={
          <a href={adminOrigin()} className={buttonVariants()}>
            Open the operator console
          </a>
        }
      >
        Subscription payments and shops are managed in the operator console.
      </Empty>
    </Panel>
  )
}

/** The small arrow that says which way the money went. */
function Direction({ kind }: { kind: LedgerEntry["kind"] }) {
  const Icon = kind === "credit" ? ArrowUpRightIcon : ArrowDownLeftIcon
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", kind === "credit" ? "bg-owed/10 text-owed" : "bg-paid/10 text-paid")}>
      <Icon className="size-4" />
    </span>
  )
}

function Owner({ data, me }: { data: OwnerDashboard; me: Me }) {
  usePage(data.shop.name)
  const subscription = me.subscription
  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,oklch(0.46_0.17_264),oklch(0.34_0.13_268))] p-5 text-white shadow-sm sm:p-7">
        <div aria-hidden="true" className="absolute -top-20 -right-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-sm text-white/75">Total outstanding credit</div>
            <div className="tabular mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{ngultrum(data.total_outstanding_cents)}</div>
            <div className="mt-2 text-sm text-white/75">{pluralize(data.customers_count, "customer")} · updated just now</div>
          </div>
          <AppLink href="/accounts/new" className={buttonVariants({ size: "lg", className: "bg-white text-[oklch(0.42_0.16_264)] shadow-sm hover:bg-white/90 max-sm:w-full" })}>
            <PlusIcon /> Add customer
          </AppLink>
        </div>
      </section>

      <InstallCard />

      <StatGrid>
        <Stat label="Customers" value={data.customers_count} href="/accounts" />
        <Stat label="Repaid this month" value={ngultrum(data.repaid_month_cents)} tone="paid" />
        <Stat label="Overdue accounts" value={data.overdue_count} tone={data.overdue_count > 0 ? "owed" : undefined} />
        <Stat label="Items" value={data.items_count} href="/menu_items" />
      </StatGrid>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          {data.overdue_accounts.length > 0 && (
            <Panel
              flush
              title={
                <span className="flex items-center gap-2">
                  Overdue balances <Count tone="owed">{data.overdue_count}</Count>
                </span>
              }
            >
              <Rows>
                {data.overdue_accounts.map((account) => (
                  <Row
                    key={account.id}
                    href={`/accounts/${account.id}`}
                    leading={<Initial text={account.display_name} tone="owed" />}
                    title={account.display_name}
                    subtitle={<span className="text-warn">{pluralize(account.days_overdue, "day")} overdue</span>}
                    trailing={<Money cents={account.balance_cents} tone="owed" />}
                    chevron
                  />
                ))}
              </Rows>
            </Panel>
          )}

          <Panel flush title="Recent activity">
            {data.recent_transactions.length > 0 ? (
              <Rows>
                {data.recent_transactions.map((entry) => (
                  <Row
                    key={entry.id}
                    href={`/accounts/${entry.account.id}`}
                    leading={<Direction kind={entry.kind} />}
                    title={`${entry.kind === "credit" ? "Credit" : "Payment"} · ${entry.account.display_name}`}
                    subtitle={entry.description || entry.payment_method || "—"}
                    trailing={
                      <>
                        <Money cents={entry.signed_amount_cents} signed tone={entry.kind === "credit" ? "owed" : "paid"} />
                        <span className="text-xs text-muted-foreground">{timeAgoInWords(entry.occurred_at)} ago</span>
                      </>
                    }
                  />
                ))}
              </Rows>
            ) : (
              <Empty icon={ScrollTextIcon} title="Nothing recorded yet">
                Add a customer, then record their first credit.
              </Empty>
            )}
          </Panel>
        </div>

        <Panel flush title="Shop">
          <Rows>
            <Row href="/menu_items" leading={<RowIcon icon={PackageIcon} />} title="Items" subtitle="What you sell, to pick from when recording credit" chevron />
            <Row href="/bank_accounts" leading={<RowIcon icon={LandmarkIcon} />} title="Bank details" subtitle="What customers see when they pay you" chevron />
            <Row
              href="/subscription"
              leading={<RowIcon icon={CreditCardIcon} />}
              title="Billing"
              subtitle={subscription ? `${subscription.status_label} · ${subscription.summary}` : "No subscription"}
              chevron
            />
          </Rows>
        </Panel>
      </div>
    </div>
  )
}

function RowIcon({ icon: Icon }: { icon: typeof StoreIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-[1.125rem]" />
    </span>
  )
}

function Customer({ data }: { data: CustomerDashboard }) {
  const t = useT()
  usePage(t("customer_home.title"))
  const settled = data.total_owed_cents === 0
  return (
    <div className="grid gap-6">
      <section className={cn("relative overflow-hidden rounded-2xl p-5 shadow-sm sm:p-7", settled ? "bg-[linear-gradient(135deg,oklch(0.52_0.12_158),oklch(0.4_0.1_165))] text-white" : "bg-[linear-gradient(135deg,oklch(0.46_0.17_264),oklch(0.34_0.13_268))] text-white")}>
        <div aria-hidden="true" className="absolute -top-20 -right-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="text-sm opacity-75">{t("customer_home.total_label")}</div>
          <div className="tabular mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{ngultrum(data.total_owed_cents)}</div>
          <div className="mt-2 text-sm opacity-75">{data.total_owed_cents > 0 ? t("customer_home.outstanding_across", { count: data.accounts.length }) : t("customer_home.all_settled")}</div>
        </div>
      </section>

      <Panel flush>
        <Rows>
          <Row href="/shops" leading={<RowIcon icon={StoreIcon} />} title={t("shops.card_title")} subtitle={t("shops.card_body")} chevron />
        </Rows>
      </Panel>

      <InstallCard />

      <StatGrid className="lg:grid-cols-2">
        <Stat label={t("customer_home.shops")} value={data.accounts.length} />
        <Stat label={t("customer_home.taken_this_month")} value={ngultrum(data.spent_month_cents)} />
      </StatGrid>

      <Panel flush title={t("customer_home.my_accounts")}>
        {data.accounts.length > 0 ? (
          <Rows>
            {data.accounts.map((account) => (
              <Row
                key={account.id}
                href={`/accounts/${account.id}`}
                leading={<Initial text={account.shop.name} />}
                title={account.shop.name}
                subtitle={account.customer_phone || t("customer_home.credit_account")}
                trailing={
                  <>
                    <Money cents={account.balance_cents} tone="auto" />
                    <Badge variant={balanceBadge(account)}>{balanceWord(account, t)}</Badge>
                  </>
                }
                chevron
              />
            ))}
          </Rows>
        ) : (
          <Empty icon={ShoppingBagIcon} title={t("customer_home.no_shops_title")}>
            {t("customer_home.no_shops_body")}
          </Empty>
        )}
      </Panel>

      {data.recent_transactions.length > 0 && (
        <Panel flush title={t("customer_home.recent_activity")}>
          <Rows>
            {data.recent_transactions.map((entry) => (
              <Row
                key={entry.id}
                leading={<Direction kind={entry.kind} />}
                title={entry.account.shop_name}
                subtitle={entry.description || (entry.kind === "payment" ? "Payment" : "Credit")}
                trailing={
                  <>
                    <Money cents={entry.signed_amount_cents} signed tone={entry.kind === "credit" ? "owed" : "paid"} />
                    <span className="text-xs text-muted-foreground">{dayMonth(entry.occurred_at)}</span>
                  </>
                }
              />
            ))}
          </Rows>
        </Panel>
      )}
    </div>
  )
}
