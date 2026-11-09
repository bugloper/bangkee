import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BellRingIcon,
  CreditCardIcon,
  LandmarkIcon,
  PlusIcon,
  PackageIcon,
  ScrollTextIcon,
  ShoppingBagIcon,
  StoreIcon,
  TruckIcon,
  UsersRoundIcon,
} from "lucide-react"

import { api } from "@/api/client"
import type { CustomerDashboard, LedgerEntry, Me, OwnerDashboard } from "@/api/types"
import { AdminOverview } from "@/components/admin-overview"
import { AppLink } from "@/components/app-link"
import { DayBars } from "@/components/charts"
import { Loading } from "@/components/form"
import { Count, Empty, Initial, Money, Panel, Row, Rows, Stat, StatGrid } from "@/components/kit"
import { InstallCard } from "@/components/pwa"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
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
  // The operator's home is the console's overview.
  if (staff) return <AdminOverview />
  if (!data || !me) return <Loading />
  return data.kind === "owner" ? <Owner data={data} me={me} /> : <Customer data={data} />
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
  const owns = me.permissions.includes("owner")
  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-[1.25rem] bg-[linear-gradient(120deg,oklch(0.5_0.26_277),oklch(0.6_0.2_266))] p-5 text-white shadow-lg shadow-primary/25 sm:p-7">
        <div aria-hidden="true" className="absolute -top-20 -right-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-sm text-white/75">Total outstanding credit</div>
            <div className="tabular mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{ngultrum(data.total_outstanding_cents)}</div>
            <div className="mt-2 text-sm text-white/75">{pluralize(data.customers_count, "customer")} · updated just now</div>
          </div>
          {me.permissions.includes("record") && (
            <AppLink href="/accounts/new" className={buttonVariants({ size: "lg", className: "bg-white text-primary shadow-sm hover:bg-white/90 max-sm:w-full" })}>
              <PlusIcon /> Add customer
            </AppLink>
          )}
        </div>
      </section>

      <InstallCard />

      <StatGrid>
        <Stat label="Credit given today" value={ngultrum(data.credit_today_cents)} tone="owed" />
        <Stat label="Collected today" value={ngultrum(data.payments_today_cents)} tone="paid" />
        <Stat
          label="Overdue"
          value={ngultrum(data.overdue_cents)}
          tone={data.overdue_count > 0 ? "warn" : undefined}
          href="/accounts?filter=overdue"
          hint={pluralize(data.overdue_count, "customer")}
        />
        <Stat label="Customers owing" value={data.owing_count} href="/accounts?filter=outstanding" hint={`of ${data.customers_count}`} />
      </StatGrid>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <Panel
            title="Collected, last 14 days"
            description={`${ngultrum(data.trend.reduce((sum, day) => sum + day.payment_cents, 0))} in · ${ngultrum(data.trend.reduce((sum, day) => sum + day.credit_cents, 0))} given on credit · ${ngultrum(data.repaid_month_cents)} this month`}
            footer={
              <AppLink href="/insights" className="text-[0.8125rem] font-medium text-primary hover:underline">
                Month by month in Insights
              </AppLink>
            }
          >
            <DayBars label="Payments collected each day" bars={data.trend.map((day) => ({ day: day.day, cents: day.payment_cents, aside: `${ngultrum(day.credit_cents)} given on credit` }))} />
          </Panel>

          {data.disputed.length > 0 && (
            <Panel
              flush
              title={
                <span className="flex items-center gap-2">
                  Flagged by customers <Count tone="owed">{data.disputed.length}</Count>
                </span>
              }
              description="They say these entries are wrong. The balance is unchanged until you edit or cross one out."
            >
              <Rows>
                {data.disputed.map((entry) => (
                  <Row
                    key={entry.id}
                    href={`/accounts/${entry.account.id}?entry=${entry.id}`}
                    leading={<Direction kind={entry.kind} />}
                    title={`${entry.kind === "credit" ? "Credit" : "Payment"} · ${entry.account.display_name}`}
                    subtitle={<span className="text-owed">“{[...entry.responses].reverse().find((r) => r.action === "disputed")?.note ?? "Flagged"}”</span>}
                    trailing={<Money cents={entry.amount_cents} tone={entry.kind === "credit" ? "owed" : "paid"} />}
                    chevron
                  />
                ))}
              </Rows>
            </Panel>
          )}

          {data.late_installments.length > 0 && (
            <Panel
              flush
              title={
                <span className="flex items-center gap-2">
                  Late installments <Count tone="owed">{data.late_installments.length}</Count>
                </span>
              }
            >
              <Rows>
                {data.late_installments.map((plan) => (
                  <Row
                    key={plan.id}
                    href={`/accounts/${plan.account_id}/installments`}
                    leading={<Initial text={plan.customer_name} tone="owed" />}
                    title={plan.customer_name}
                    subtitle={<span className="text-warn">{plan.overdue_count === 1 ? "1 installment late" : `${plan.overdue_count} installments late`}</span>}
                    trailing={<Money cents={plan.overdue_cents} tone="owed" />}
                    chevron
                  />
                ))}
              </Rows>
            </Panel>
          )}

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
                    leading={<Initial text={account.display_name} tone="owed" src={account.customer_photo_url} />}
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

        <div className="grid gap-6">
        {data.top_accounts.length > 0 && (
          <Panel flush title="Largest balances">
            <Rows>
              {data.top_accounts.map((account) => (
                <Row
                  key={account.id}
                  href={`/accounts/${account.id}`}
                  leading={<Initial text={account.display_name} src={account.customer_photo_url} />}
                  title={account.display_name}
                  subtitle={account.overdue ? <span className="text-warn">{pluralize(account.days_overdue, "day")} overdue</span> : account.last_activity_at ? `Last entry ${timeAgoInWords(account.last_activity_at)} ago` : "No entries yet"}
                  trailing={<Money cents={account.balance_cents} tone="owed" />}
                  chevron
                />
              ))}
            </Rows>
          </Panel>
        )}

        {/* A phone's tab bar has no room for these; a desktop has them in the sidebar. */}
        <Panel flush title="Shop" className="md:hidden">
          <Rows>
            <Row href="/menu_items" leading={<RowIcon icon={PackageIcon} />} title="Items" subtitle="What you sell, to pick from when recording credit" chevron />
            {owns && <Row href="/shop_profile" leading={<RowIcon icon={StoreIcon} />} title="Shop profile" subtitle="What customers read about your shop" chevron />}
            {owns && <Row href="/bank_accounts" leading={<RowIcon icon={LandmarkIcon} />} title="Bank details" subtitle="What customers see when they pay you" chevron />}
            <Row href="/suppliers" leading={<RowIcon icon={TruckIcon} />} title="Suppliers" subtitle="What you owe the people you buy from" chevron />
            {owns && <Row href="/reminders" leading={<RowIcon icon={BellRingIcon} />} title="Reminders" subtitle="Reminding overdue customers, and when" chevron />}
            {owns && <Row href="/staff" leading={<RowIcon icon={UsersRoundIcon} />} title="Staff" subtitle="The people who record entries with you" chevron />}
            {owns && (
              <Row
                href="/subscription"
                leading={<RowIcon icon={CreditCardIcon} />}
                title="Billing"
                subtitle={subscription ? `${subscription.status_label} · ${subscription.summary}` : "No subscription"}
                chevron
              />
            )}
          </Rows>
        </Panel>
        </div>
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
  // A phone stacks these in order; a desktop places them in two columns —
  // the balance and the accounts on the left, the numbers and activity right.
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:grid-rows-[auto_auto_1fr] xl:items-start">
      <section className={cn("relative overflow-hidden rounded-[1.25rem] p-5 shadow-lg sm:p-7 xl:col-start-1 xl:row-start-1", settled ? "bg-[linear-gradient(135deg,oklch(0.52_0.12_158),oklch(0.4_0.1_165))] text-white" : "bg-[linear-gradient(120deg,oklch(0.5_0.26_277),oklch(0.6_0.2_266))] text-white shadow-primary/25")}>
        <div aria-hidden="true" className="absolute -top-20 -right-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="text-sm opacity-75">{t("customer_home.total_label")}</div>
          <div className="tabular mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{ngultrum(data.total_owed_cents)}</div>
          <div className="mt-2 text-sm opacity-75">{data.total_owed_cents > 0 ? t("customer_home.outstanding_across", { count: data.accounts.length }) : t("customer_home.all_settled")}</div>
        </div>
      </section>

      <Panel flush className="xl:col-start-1 xl:row-start-3">
        <Rows>
          <Row href="/shops" leading={<RowIcon icon={StoreIcon} />} title={t("shops.card_title")} subtitle={t("shops.card_body")} chevron />
        </Rows>
      </Panel>

      <div className="empty:hidden xl:col-span-2 xl:row-start-4">
        <InstallCard />
      </div>

      <StatGrid className="xl:col-start-2 xl:row-start-1 lg:grid-cols-2">
        <Stat label={t("customer_home.shops")} value={data.accounts.length} />
        <Stat label={t("customer_home.taken_this_month")} value={ngultrum(data.spent_month_cents)} />
      </StatGrid>

      <Panel flush title={t("customer_home.my_accounts")} className="xl:col-start-1 xl:row-start-2">
        {data.accounts.length > 0 ? (
          <Rows>
            {data.accounts.map((account) => (
              <Row
                key={account.id}
                href={`/accounts/${account.id}`}
                leading={<Initial text={account.shop.name} src={account.shop.photo_url} />}
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
        <Panel flush title={t("customer_home.recent_activity")} className="xl:col-start-2 xl:row-span-2 xl:row-start-2">
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
