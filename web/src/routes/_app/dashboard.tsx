import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ArrowDownLeftIcon, ArrowUpRightIcon, ShoppingBagIcon, StoreIcon } from "lucide-react"

import { api } from "@/api/client"
import type { CustomerDashboard, LedgerEntry, Me, OwnerDashboard } from "@/api/types"
import { AdminOverview } from "@/components/admin-overview"
import { Loading } from "@/components/form"
import { Empty, Initial, Money, Panel, Row, Rows, Stat, StatGrid } from "@/components/kit"
import { OwnerHome } from "@/components/owner-home"
import { InstallCard } from "@/components/pwa"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/lib/i18n"
import { balanceBadge, balanceWord } from "@/lib/ledger"
import { useMe } from "@/lib/me"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { dayMonth } from "@/lib/time"
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
  return <OwnerHome data={data} me={me} />
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
      <section
        className={cn(
          "relative overflow-hidden rounded-[1.25rem] p-5 shadow-lg sm:p-7 xl:col-start-1 xl:row-start-1",
          settled
            ? "bg-[linear-gradient(135deg,oklch(0.52_0.12_158),oklch(0.4_0.1_165))] text-white"
            : "bg-[linear-gradient(120deg,oklch(0.5_0.26_277),oklch(0.6_0.2_266))] text-white shadow-primary/25",
        )}
      >
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
