import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, PackageIcon } from "lucide-react"
import { useState } from "react"

import type { Insights } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { AreaChart } from "@/components/area-chart"
import { Initial, Panel } from "@/components/kit"
import { ngultrum, pluralize } from "@/lib/money"
import { cn } from "@/lib/utils"

// One month of the shop's book at a glance, against the month before: what
// went out on credit, what came back, how the amount owed moved, and how much
// of the credit was collected; the six months as a chart; how old the money
// owed is; who took most and how people paid; and what sold. Everything here
// is worked out from the entries and balances Insights already loads.

type Month = Insights["months"][number]

function monthName(month: string): string {
  const [year, m] = month.split("-").map(Number)
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })
}

/** The change against last month, coloured by whether it is good news. */
function Change({ now, before, goodWhenUp, unit = "percent" }: { now: number; before: number | null; goodWhenUp: boolean | null; unit?: "percent" | "points" }) {
  if (before == null) return null
  const diff = unit === "points" ? now - before : before === 0 ? null : ((now - before) / before) * 100
  if (diff == null) return now > 0 ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">New</span> : null
  if (Math.round(diff) === 0)
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        <MinusIcon className="size-3" /> Level
      </span>
    )
  const up = diff > 0
  const good = goodWhenUp == null ? null : up === goodWhenUp
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
        good === true ? "bg-paid/10 text-paid" : good === false ? "bg-owed/10 text-owed" : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-3" /> {Math.abs(Math.round(diff))}
      {unit === "points" ? " pts" : "%"}
    </span>
  )
}

function Figure({ label, value, change, hint, tone }: { label: string; value: string; change: React.ReactNode; hint: string; tone?: "owed" | "paid" }) {
  return (
    <div className="rounded-[1.25rem] border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.8125rem] font-medium text-muted-foreground">{label}</span>
        {change}
      </div>
      <div className={cn("tabular mt-2 text-2xl font-semibold tracking-tight", tone === "owed" && "text-owed", tone === "paid" && "text-paid")}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}

/** A ranked list with a bar for each row's share of the largest. */
function Ranked({ rows, empty }: { rows: { key: string; label: React.ReactNode; value: number; detail: string; href?: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  const top = Math.max(...rows.map((r) => r.value))
  return (
    <div className="grid gap-3.5">
      {rows.map((row) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{row.label}</span>
              <span className="tabular shrink-0 font-semibold">{row.detail}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.max(3, (row.value / top) * 100)}%` }} />
            </div>
          </>
        )
        return row.href ? (
          <AppLink key={row.key} href={row.href} className="block rounded-lg transition-opacity hover:opacity-80">
            {body}
          </AppLink>
        ) : (
          <div key={row.key}>{body}</div>
        )
      })}
    </div>
  )
}

// How long what is owed has gone without an entry — older is riskier. One
// hue, light to dark, because the buckets have an order.
const AGES: [string, number, number, string][] = [
  ["Under 30 days", 0, 30, "color-mix(in oklab, var(--owed) 30%, var(--card))"],
  ["30–59 days", 30, 60, "color-mix(in oklab, var(--owed) 55%, var(--card))"],
  ["60–89 days", 60, 90, "color-mix(in oklab, var(--owed) 78%, var(--card))"],
  ["90 days or more", 90, Infinity, "var(--owed)"],
]

function Ageing({ data }: { data: Insights }) {
  // The moment the screen opened: ages are counted from it.
  const [now] = useState(() => Date.now())
  const buckets = AGES.map(([label, from, to, color]) => {
    const accounts = data.owing.filter((a) => {
      const days = a.last_activity_at ? (now - new Date(a.last_activity_at).getTime()) / 86_400_000 : Infinity
      return days >= from && days < to
    })
    return { label, color, count: accounts.length, cents: accounts.reduce((sum, a) => sum + a.balance_cents, 0) }
  })
  const total = data.outstanding_cents
  return (
    <Panel title="How old the money owed is" description={total > 0 ? `${ngultrum(total)} owed, by time since each customer's last entry` : "Nobody owes you anything"}>
      {total > 0 ? (
        <>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={buckets.map((b) => `${b.label}: ${ngultrum(b.cents)}`).join(", ")}>
            {buckets.map((b) => (b.cents > 0 ? <div key={b.label} style={{ width: `${(b.cents / total) * 100}%`, background: b.color }} /> : null))}
          </div>
          <div className="mt-4 grid gap-2.5">
            {buckets.map((b) => (
              <div key={b.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-[3px]" style={{ background: b.color }} />
                  {b.label}
                  <span className="text-muted-foreground">· {pluralize(b.count, "customer")}</span>
                </span>
                <span className="tabular font-medium">{ngultrum(b.cents)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Every customer is settled up.</p>
      )}
    </Panel>
  )
}

export function InsightsOverview({ data, onMonth }: { data: Insights; onMonth: (month: string) => void }) {
  const index = data.months.findIndex((m) => m.month === data.month)
  const chosen: Month = data.months[index]
  const before: Month | undefined = index > 0 ? data.months[index - 1] : undefined
  const net = chosen.credit_cents - chosen.payment_cents
  const rate = (m: Month) => (m.credit_cents > 0 ? (m.payment_cents / m.credit_cents) * 100 : 0)
  const name = monthName(data.month)

  // This month's entries, worked through once.
  const credits = data.entries.filter((e) => e.kind === "credit")
  const payments = data.entries.filter((e) => e.kind === "payment")
  const activeCustomers = new Set(data.entries.map((e) => e.account.id)).size

  const byCustomer = new Map<number, { name: string; cents: number; count: number }>()
  for (const e of credits) {
    const row = byCustomer.get(e.account.id) ?? { name: e.account.display_name, cents: 0, count: 0 }
    row.cents += e.amount_cents
    row.count++
    byCustomer.set(e.account.id, row)
  }
  const topCustomers = [...byCustomer.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .slice(0, 5)
    .map(([id, row]) => ({
      key: String(id),
      href: `/accounts/${id}`,
      value: row.cents,
      detail: ngultrum(row.cents),
      label: (
        <span className="flex items-center gap-2">
          <Initial text={row.name} size="sm" />
          <span className="truncate">{row.name}</span>
          <span className="text-xs font-normal text-muted-foreground">· {pluralize(row.count, "entry", "entries")}</span>
        </span>
      ),
    }))

  const byMethod = new Map<string, { cents: number; count: number }>()
  for (const e of payments) {
    const method = e.payment_method || "Not recorded"
    const row = byMethod.get(method) ?? { cents: 0, count: 0 }
    row.cents += e.amount_cents
    row.count++
    byMethod.set(method, row)
  }
  const methods = [...byMethod.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([method, row]) => ({ key: method, value: row.cents, detail: ngultrum(row.cents), label: `${method} · ${pluralize(row.count, "payment")}` }))

  const byItem = new Map<string, { cents: number; quantity: number }>()
  for (const e of credits) {
    for (const item of e.line_items) {
      const row = byItem.get(item.name) ?? { cents: 0, quantity: 0 }
      row.cents += item.total_cents
      row.quantity += Number(item.quantity)
      byItem.set(item.name, row)
    }
  }
  const items = [...byItem.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .slice(0, 6)
    .map(([item, row]) => ({ key: item, value: row.cents, detail: ngultrum(row.cents), label: `${item} · ${Number(row.quantity.toFixed(2))} sold` }))

  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="Month" className="flex gap-1.5 overflow-x-auto pb-1">
        {data.months.map((m) => (
          <button
            key={m.month}
            type="button"
            role="radio"
            aria-checked={m.month === data.month}
            onClick={() => onMonth(m.month)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              m.month === data.month ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure
          label="Credit given"
          value={ngultrum(chosen.credit_cents)}
          tone="owed"
          change={<Change now={chosen.credit_cents} before={before?.credit_cents ?? null} goodWhenUp={null} />}
          hint={`${pluralize(credits.length, "entry", "entries")} in ${name}`}
        />
        <Figure
          label="Collected"
          value={ngultrum(chosen.payment_cents)}
          tone="paid"
          change={<Change now={chosen.payment_cents} before={before?.payment_cents ?? null} goodWhenUp />}
          hint={`${pluralize(payments.length, "payment")} in ${name}`}
        />
        <Figure
          label="Change in what's owed"
          value={`${net > 0 ? "+" : net < 0 ? "−" : ""}${ngultrum(Math.abs(net))}`}
          change={null}
          hint={net > 0 ? "More went out on credit than came back" : net < 0 ? "More came back than went out" : "Credit and payments balanced"}
        />
        <Figure
          label="Collection rate"
          value={chosen.credit_cents > 0 ? `${Math.round(rate(chosen))}%` : "—"}
          change={before && before.credit_cents > 0 && chosen.credit_cents > 0 ? <Change now={rate(chosen)} before={rate(before)} goodWhenUp unit="points" /> : null}
          hint="Paid back, for each Nu. 100 given on credit"
        />
      </div>

      <Panel
        title="Sales paid on the spot"
        description={`${pluralize(chosen.sales_count, "sale")} in ${name} — not in anyone's credit`}
        footer={
          <AppLink href="/sales" className="text-[0.8125rem] font-medium text-primary hover:underline">
            Day by day in Sales
          </AppLink>
        }
      >
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div>
            <div className="tabular text-3xl font-medium tracking-tight">{ngultrum(chosen.sales_cents)}</div>
            <div className="mt-1 text-sm">
              <Change now={chosen.sales_cents} before={before?.sales_cents ?? null} goodWhenUp />
            </div>
          </div>
          <AreaChart
            height={150}
            label="Sales paid on the spot each month, the last six months"
            labels={data.months.map((m) => m.label)}
            series={[{ key: "sales", label: "Sales", color: "var(--primary)", values: data.months.map((m) => m.sales_cents) }]}
            format={(cents) => ngultrum(cents)}
            axis={(cents) => (cents >= 100_000 ? `${Number((cents / 100_000).toFixed(1))}k` : String(Math.round(cents / 100)))}
          />
        </div>
      </Panel>

      <Panel title="Credit and collections" description="The last six months">
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px] bg-owed" />
            <span className="text-muted-foreground">Credit given</span>
            <span className="tabular font-semibold">{ngultrum(data.months.reduce((s, m) => s + m.credit_cents, 0))}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px] bg-paid" />
            <span className="text-muted-foreground">Collected</span>
            <span className="tabular font-semibold">{ngultrum(data.months.reduce((s, m) => s + m.payment_cents, 0))}</span>
          </span>
        </div>
        <AreaChart
          height={240}
          label="Credit given and money collected each month, the last six months"
          labels={data.months.map((m) => m.label)}
          series={[
            { key: "credit", label: "Credit given", color: "var(--owed)", values: data.months.map((m) => m.credit_cents) },
            { key: "payment", label: "Collected", color: "var(--paid)", values: data.months.map((m) => m.payment_cents) },
          ]}
          format={(cents) => ngultrum(cents)}
          axis={(cents) => (cents >= 100_000 ? `${Number((cents / 100_000).toFixed(1))}k` : String(Math.round(cents / 100)))}
        />
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Ageing data={data} />
        <Panel title="Customers" description={`In ${name}`}>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
            {(
              [
                ["In your book", data.customers_count],
                ["Active this month", activeCustomers],
                ["Joined this month", chosen.new_customers],
                ["Owe you now", data.owing.length],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="bg-card px-3.5 py-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="tabular text-xl font-semibold">{value}</div>
              </div>
            ))}
          </div>
          {data.overdue_count > 0 && (
            <AppLink href="/accounts?filter=overdue" className="mt-3 block text-sm font-medium text-primary hover:underline">
              {pluralize(data.overdue_count, "balance")} overdue — see who
            </AppLink>
          )}
        </Panel>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Took the most on credit" description={name}>
          <Ranked rows={topCustomers} empty={`No credit was given in ${name}.`} />
        </Panel>
        <Panel title="How customers paid" description={name}>
          <Ranked rows={methods} empty={`No payments came in during ${name}.`} />
        </Panel>
      </div>

      <Panel title="What sold on credit" description={`From itemized purchases in ${name}`}>
        {items.length > 0 ? (
          <Ranked rows={items} empty="" />
        ) : (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <PackageIcon className="size-5 shrink-0" /> Record purchases item by item, and what sells best shows here.
          </div>
        )}
      </Panel>
    </div>
  )
}
