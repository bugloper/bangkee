import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowDownUpIcon, CircleAlertIcon, ScrollTextIcon, TrendingDownIcon, TrendingUpIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { Insights } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { MonthBars, Ring, RingLegend, type Slice } from "@/components/charts"
import { Loading } from "@/components/form"
import { Empty, Initial, Money, Panel, Row, Rows } from "@/components/kit"
import { ngultrum, pluralize } from "@/lib/money"
import { usePage } from "@/lib/page"
import { dayMonth } from "@/lib/time"
import { cn } from "@/lib/utils"

type View = "credit" | "payments" | "owed"
const VIEWS: [View, string][] = [
  ["credit", "Credit"],
  ["payments", "Payments"],
  ["owed", "Owed"],
]

export const Route = createFileRoute("/_app/insights")({
  validateSearch: (search: Record<string, unknown>): { view: View; month?: string } => ({
    view: search.view === "payments" || search.view === "owed" ? search.view : "credit",
    month: typeof search.month === "string" && /^\d{4}-\d{2}$/.test(search.month) ? search.month : undefined,
  }),
  component: InsightsScreen,
})

// The shop's book over time: what went out on credit and what came back,
// month by month, and who owes what now.
function InsightsScreen() {
  usePage("Insights")
  const { view, month } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data } = useQuery({ queryKey: ["insights", month ?? ""], queryFn: () => api.insights(month), placeholderData: keepPreviousData })

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4 xl:max-w-none">
      <div role="tablist" aria-label="What to look at" className="grid grid-cols-3 gap-1 rounded-full border bg-card p-1 xl:w-md">
        {VIEWS.map(([key, name]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => void navigate({ search: { view: key, month }, replace: true })}
            className={cn("h-11 rounded-full text-[0.9375rem] font-medium transition-colors", view === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {name}
          </button>
        ))}
      </div>
      {!data ? (
        <Loading />
      ) : view === "owed" ? (
        <Owed data={data} />
      ) : (
        <Flow data={data} kind={view === "credit" ? "credit" : "payment"} onMonth={(key) => void navigate({ search: { view, month: key }, replace: true })} />
      )}
    </div>
  )
}

const METHODS = ["All", "Mobile transfer", "Cash", "Other"] as const

/** Credit given, or payments received: the months as bars, then the chosen month's entries. */
function Flow({ data, kind, onMonth }: { data: Insights; kind: "credit" | "payment"; onMonth: (month: string) => void }) {
  const [method, setMethod] = useState<(typeof METHODS)[number]>("All")
  const cents = (m: Insights["months"][number]) => (kind === "credit" ? m.credit_cents : m.payment_cents)
  const index = data.months.findIndex((m) => m.month === data.month)
  const chosen = data.months[index]
  const before = index > 0 ? data.months[index - 1] : undefined
  const change = before && cents(before) > 0 ? ((cents(chosen) - cents(before)) / cents(before)) * 100 : null
  // More money back is good news; more on credit is just more trade.
  const good = change != null && (kind === "payment" ? change >= 0 : null)

  const entries = data.entries.filter((e) => e.kind === kind && (kind === "credit" || method === "All" || e.payment_method === method))
  const title = kind === "credit" ? "Credit given" : "Payments received"

  return (
    // A desktop puts the month's chart beside its entries.
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start">
      <Panel>
        <div className="text-sm font-medium text-muted-foreground">
          {title} · {monthName(data.month)}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tabular text-4xl font-semibold tracking-tight">{ngultrum(cents(chosen))}</span>
          {change != null && (
            <span className={cn("tabular inline-flex items-center gap-1 text-sm font-semibold", good === true ? "text-paid" : good === false ? "text-owed" : "text-muted-foreground")}>
              {change >= 0 ? <TrendingUpIcon className="size-4" /> : <TrendingDownIcon className="size-4" />}
              {Math.abs(change).toFixed(1)}%<span className="font-normal text-muted-foreground">vs {before!.label}</span>
            </span>
          )}
        </div>
        <div className="mt-8">
          <MonthBars bars={data.months.map((m) => ({ key: m.month, label: m.label, cents: cents(m) }))} selected={data.month} onSelect={onMonth} label={`${title} by month`} />
        </div>
      </Panel>

      <Panel flush>
        {kind === "payment" && (
          <div role="tablist" aria-label="How they paid" className="flex overflow-x-auto border-b px-2">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={method === m}
                onClick={() => setMethod(m)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 px-3 py-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                  method === m ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "Mobile transfer" ? "Mobile" : m}
              </button>
            ))}
          </div>
        )}
        {entries.length > 0 ? (
          <Rows>
            {entries.map((entry) => (
              <Row
                key={entry.id}
                href={`/accounts/${entry.account.id}`}
                leading={<Initial text={entry.account.display_name} />}
                title={entry.account.display_name}
                subtitle={dayMonth(entry.occurred_at)}
                trailing={
                  <>
                    <Money cents={entry.amount_cents} signed={kind === "payment"} tone={kind === "credit" ? "owed" : "paid"} className="text-[0.9375rem] font-semibold" />
                    <span className="max-w-36 truncate text-xs text-muted-foreground">
                      {kind === "payment" ? entry.payment_method || "Payment" : entry.description || (entry.itemized ? pluralize(entry.line_items.length, "item") : "Credit")}
                    </span>
                  </>
                }
              />
            ))}
          </Rows>
        ) : (
          <Empty icon={ScrollTextIcon} title={`Nothing in ${monthName(data.month)}`}>
            {kind === "credit" ? "No credit was given this month." : "No payments came in this month."}
          </Empty>
        )}
      </Panel>
    </div>
  )
}

const SLICE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"]

/** Who owes what: the biggest balances as a ring, everyone as a list. */
function Owed({ data }: { data: Insights }) {
  const [dismissed, setDismissed] = useState(false)
  const [order, setOrder] = useState<"most" | "late">("most")
  const total = data.outstanding_cents

  if (data.owing.length === 0) {
    return (
      <Panel>
        <Empty icon={ScrollTextIcon} title="Nobody owes you anything">
          Every customer is settled up.
        </Empty>
      </Panel>
    )
  }

  // The five who owe most each get a slice; everyone else shares one.
  const top = data.owing.slice(0, 5)
  const rest = data.owing.slice(5)
  const slices: Slice[] = top.map((a, i) => ({ key: String(a.id), label: a.display_name, cents: a.balance_cents, color: SLICE_COLORS[i] }))
  if (rest.length > 0) slices.push({ key: "others", label: `${pluralize(rest.length, "other")}`, cents: rest.reduce((sum, a) => sum + a.balance_cents, 0), color: "var(--series-other)" })
  const colorOf = new Map(slices.map((s) => [s.key, s.color]))

  const listed = [...data.owing].sort((a, b) => (order === "most" ? b.balance_cents - a.balance_cents : b.days_overdue - a.days_overdue || b.balance_cents - a.balance_cents))
  const topShare = total > 0 ? Math.round((data.owing[0].balance_cents / total) * 100) : 0

  return (
    <div className="grid gap-4 xl:max-w-3xl">
      {data.overdue_count > 0 && !dismissed && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-accent px-4 py-3">
          <CircleAlertIcon className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold text-accent-foreground">{pluralize(data.overdue_count, "balance")} overdue.</div>
            <div className="text-muted-foreground">Bangkee reminds them each morning; a word at the counter helps too.</div>
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="text-accent-foreground/70 hover:text-accent-foreground">
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      <Panel>
        <div className="py-2">
          <Ring slices={slices} label={`Who owes what: ${slices.map((s) => `${s.label} ${ngultrum(s.cents)}`).join(", ")}`}>
            <span className="tabular rounded-full bg-muted px-3 py-1 text-sm font-semibold">{topShare}%</span>
            <span className="mt-2 text-sm text-muted-foreground">Owed to you</span>
            <span className="tabular mt-0.5 text-2xl font-semibold tracking-tight">{ngultrum(total)}</span>
            <span className="mt-0.5 text-sm text-muted-foreground">by {pluralize(data.owing.length, "customer")}</span>
          </Ring>
        </div>
        <div className="mt-4">
          <RingLegend slices={slices} />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {data.owing[0].display_name}’s {topShare}% is the biggest share.
        </p>
      </Panel>

      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold">Who owes</h2>
        <button type="button" onClick={() => setOrder(order === "most" ? "late" : "most")} className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium">
          <ArrowDownUpIcon className="size-4" /> {order === "most" ? "Most owed" : "Most overdue"}
        </button>
      </div>
      <div className="grid gap-3">
        {listed.map((account) => {
          const share = total > 0 ? account.balance_cents / total : 0
          return (
            <Panel key={account.id} className="transition-colors hover:bg-muted/30">
              <AppLink href={`/accounts/${account.id}`} className="block">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="size-3 shrink-0 rounded-[3px]" style={{ background: colorOf.get(String(account.id)) ?? "var(--series-other)" }} />
                  <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{account.display_name}</span>
                  {account.overdue && <span className="text-xs font-medium text-owed">{pluralize(account.days_overdue, "day")} late</span>}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share * 100, 1.5)}%` }} />
                </div>
                <div className="mt-2 flex items-baseline justify-between text-sm">
                  <span className="tabular font-medium">{ngultrum(account.balance_cents)}</span>
                  <span className="tabular font-semibold text-primary">{Math.round(share * 100)}%</span>
                </div>
              </AppLink>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

function monthName(month: string): string {
  const [year, m] = month.split("-").map(Number)
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })
}
