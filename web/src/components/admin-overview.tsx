import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { AlarmClockIcon, ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, CircleAlertIcon, MinusIcon, ReceiptTextIcon, type LucideIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { AdminDashboard, PeriodFigure } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { AreaChart, Sparkline } from "@/components/area-chart"
import { Loading } from "@/components/form"
import { Initial } from "@/components/kit"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ngultrum, pluralize } from "@/lib/money"
import { usePage } from "@/lib/page"
import { longDate, timeAgoInWords } from "@/lib/time"
import { cn } from "@/lib/utils"

// The console's front page: how Bangkee is doing across every shop over the
// last 7, 30 or 90 days, each figure against the period before; where the
// subscriptions stand and what they bring in a month; and what needs the
// operator — payments to approve, payments overdue, trials about to end.

const PERIODS = [7, 30, 90] as const
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayLabel = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`

/** How a figure moved against the period before. */
function Delta({ figure }: { figure: PeriodFigure }) {
  const { value, previous } = figure
  if (value === previous)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        <MinusIcon className="size-3" /> 0%
      </span>
    )
  const up = value > previous
  const ratio = previous === 0 ? Infinity : value / previous
  const text = previous === 0 ? "New" : ratio >= 10 ? `×${Math.round(ratio)}` : `${Math.abs(Math.round(((value - previous) / previous) * 100))}%`
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium", up ? "bg-paid/10 text-paid" : "bg-owed/10 text-owed")}>
      <Icon className="size-3" /> {text}
    </span>
  )
}

function Kpi({ label, value, figure, footnote, spark }: { label: string; value: React.ReactNode; figure?: PeriodFigure; footnote: React.ReactNode; spark?: number[] }) {
  return (
    <Card className="gap-3 shadow-xs">
      <CardHeader>
        <CardDescription className="font-medium">{label}</CardDescription>
        {figure && (
          <CardAction>
            <Delta figure={figure} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="tabular text-[1.75rem] leading-none font-semibold tracking-tight">{value}</div>
        {spark ? <Sparkline values={spark} /> : <div className="h-9" />}
        <div className="text-xs text-muted-foreground">{footnote}</div>
      </CardContent>
    </Card>
  )
}

function Legend({ items }: { items: { label: string; color: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-sm">
          <span className="size-2.5 rounded-[3px]" style={{ background: item.color }} />
          <span className="text-muted-foreground">{item.label}</span>
          <span className="tabular font-semibold">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

// The plans in order, one hue from light to full: Basic, then Pro, then Business.
const PLAN_SHADES: [keyof AdminDashboard["mrr_by_plan"], string, string][] = [
  ["basic", "Basic", "color-mix(in oklab, var(--primary) 35%, var(--card))"],
  ["pro", "Pro", "color-mix(in oklab, var(--primary) 65%, var(--card))"],
  ["business", "Business", "var(--primary)"],
]

function Subscriptions({ data }: { data: AdminDashboard }) {
  const { plan_mix: mix } = data
  const paying = mix.basic + mix.pro + mix.business
  const cells: [string, number, string][] = [
    ["Free trial", mix.trialing, ""],
    ["Paying", paying, paying > 0 ? "text-paid" : ""],
    ["Payment due", mix.past_due, mix.past_due > 0 ? "text-warn" : ""],
    ["Locked", mix.disabled, mix.disabled > 0 ? "text-owed" : ""],
  ]
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>Subscriptions</CardTitle>
        <CardDescription>What paying shops bring in each month</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div>
          <div className="tabular text-3xl font-semibold tracking-tight">{ngultrum(data.mrr_cents)}</div>
          <div className="text-sm text-muted-foreground">a month · {ngultrum(data.mrr_cents * 12)} a year</div>
        </div>
        <div>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Monthly revenue by plan">
            {PLAN_SHADES.map(([key, , color]) =>
              data.mrr_by_plan[key] > 0 ? <div key={key} style={{ width: `${(data.mrr_by_plan[key] / Math.max(1, data.mrr_cents)) * 100}%`, background: color }} /> : null,
            )}
          </div>
          <div className="mt-3 grid gap-2">
            {PLAN_SHADES.map(([key, name, color]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
                  {name}
                  <span className="text-muted-foreground">· {pluralize(mix[key], "shop")}</span>
                </span>
                <span className="tabular font-medium">{ngultrum(data.mrr_by_plan[key])}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
          {cells.map(([label, count, tone]) => (
            <div key={label} className="bg-card px-3.5 py-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={cn("tabular text-lg font-semibold", tone)}>{count}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Attention({ data }: { data: AdminDashboard }) {
  const items: { icon: LucideIcon; tone: string; title: string; detail: string; href: string; count: number }[] = [
    {
      icon: ReceiptTextIcon,
      tone: "bg-primary/10 text-primary",
      title: "Payments to approve",
      detail: data.pending[0] ? `Oldest from ${data.pending[0].shop.name}, ${timeAgoInWords(data.pending[0].created_at)} ago` : "Nothing waiting",
      href: "/subscription_payments",
      count: data.pending_count,
    },
    {
      icon: CircleAlertIcon,
      tone: "bg-warn/10 text-warn",
      title: "Payment due",
      detail: data.payment_due[0] ? `${data.payment_due[0].name} locks in ${pluralize(data.payment_due[0].days_left, "day")}` : "Every paid shop is covered",
      href: "/all_shops",
      count: data.payment_due.length,
    },
    {
      icon: AlarmClockIcon,
      tone: "bg-muted text-muted-foreground",
      title: "Trials ending in 14 days",
      detail: data.trials_ending[0] ? `${data.trials_ending[0].name} first, in ${pluralize(data.trials_ending[0].days_left, "day")}` : "None soon",
      href: "/all_shops",
      count: data.trials_ending.length,
    },
  ]
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>What is waiting on Bangkee</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1 px-2">
        {items.map((item) => (
          <AppLink key={item.title} href={item.href} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted">
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", item.tone)}>
              <item.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
            </span>
            <span className={cn("tabular text-lg font-semibold", item.count === 0 && "text-muted-foreground")}>{item.count}</span>
            <ArrowRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </AppLink>
        ))}
      </CardContent>
    </Card>
  )
}

function MostActive({ data }: { data: AdminDashboard }) {
  return (
    <Card className="gap-0 pb-0 shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle>Most active shops</CardTitle>
        <CardDescription>By entries recorded in the last {data.days} days</CardDescription>
        <CardAction>
          <AppLink href="/all_shops" className={buttonVariants({ variant: "outline", size: "sm" })}>
            All shops
          </AppLink>
        </CardAction>
      </CardHeader>
      {data.most_active.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="pl-4">Shop</TableHead>
              <TableHead className="text-right">Entries</TableHead>
              <TableHead className="text-right max-sm:hidden">Customers</TableHead>
              <TableHead className="pr-4 text-right max-md:hidden">Last entry</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.most_active.map((shop, i) => (
              <TableRow key={shop.id}>
                <TableCell className="pl-4">
                  <span className="flex items-center gap-2.5">
                    <span className="tabular w-4 text-xs text-muted-foreground">{i + 1}</span>
                    <Initial text={shop.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{shop.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{shop.kind_label}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="tabular text-right font-medium">{shop.entries}</TableCell>
                <TableCell className="tabular text-right text-muted-foreground max-sm:hidden">{shop.customers}</TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground max-md:hidden">{timeAgoInWords(shop.last_entry_at)} ago</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="px-4 pt-2 pb-6 text-sm text-muted-foreground">No shop recorded anything in these days.</div>
      )}
    </Card>
  )
}

function TrialsEnding({ data }: { data: AdminDashboard }) {
  if (data.trials_ending.length === 0) return null
  return (
    <Card className="gap-0 pb-0 shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle>Trials ending soon</CardTitle>
        <CardDescription>Shops to welcome onto a plan</CardDescription>
      </CardHeader>
      <Table>
        <TableBody>
          {data.trials_ending.slice(0, 6).map((trial) => (
            <TableRow key={trial.shop_id}>
              <TableCell className="pl-4 font-medium">{trial.name}</TableCell>
              <TableCell className="pr-4 text-right text-muted-foreground">
                {longDate(trial.ends_at)} · <span className={cn(trial.days_left <= 3 && "font-medium text-warn")}>{pluralize(trial.days_left, "day")}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

export function AdminOverview() {
  usePage("Overview")
  const [days, setDays] = useState<number>(30)
  const { data, isFetching } = useQuery({ queryKey: ["admin", "dashboard", days], queryFn: () => api.adminDashboard(days), placeholderData: keepPreviousData })
  if (!data) return <Loading />
  const credits = data.activity_days.map((d) => d.credits)
  const payments = data.activity_days.map((d) => d.payments)
  const sum = (values: number[]) => values.reduce((total, v) => total + v, 0)
  const paying = data.plan_mix.basic + data.plan_mix.pro + data.plan_mix.business

  return (
    <div className={cn("grid gap-4 transition-opacity md:gap-5", isFetching && "opacity-70")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Across every shop</h2>
          <p className="text-sm text-muted-foreground">
            {longDate(data.from)} – today, against the {data.days} days before
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg border bg-card p-0.5 shadow-xs">
            {PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                role="radio"
                aria-checked={days === period}
                onClick={() => setDays(period)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  days === period ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {period} days
              </button>
            ))}
          </div>
          {data.pending_count > 0 && (
            <AppLink href="/subscription_payments" className={buttonVariants({ className: "max-sm:hidden" })}>
              Review {pluralize(data.pending_count, "payment")}
            </AppLink>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Money approved"
          value={ngultrum(data.approved.value)}
          figure={data.approved}
          spark={data.approved.series?.map((d) => d.value)}
          footnote={`${ngultrum(data.approved.previous)} the ${data.days} days before`}
        />
        <Kpi label="Monthly recurring revenue" value={ngultrum(data.mrr_cents)} footnote={`${ngultrum(data.mrr_cents * 12)} a year · ${pluralize(paying, "paying shop")}`} />
        <Kpi
          label="Active shops"
          value={
            <>
              {data.active_shops.value}
              <span className="text-base font-normal text-muted-foreground"> / {data.shops_count}</span>
            </>
          }
          figure={data.active_shops}
          spark={data.active_shops.series?.map((d) => d.value)}
          footnote="Recorded at least one entry"
        />
        <Kpi
          label="New shops"
          value={data.new_shops.value}
          figure={data.new_shops}
          spark={data.new_shops.series?.map((d) => d.value)}
          footnote={`${data.new_shops.previous} the ${data.days} days before`}
        />
      </div>

      <div className="grid items-start gap-4 md:gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle>Platform activity</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              {pluralize(data.entries.value, "entry", "entries")} recorded across every shop <Delta figure={data.entries} />
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Legend
              items={[
                { label: "Credits", color: "var(--owed)", value: sum(credits).toLocaleString() },
                { label: "Payments", color: "var(--paid)", value: sum(payments).toLocaleString() },
              ]}
            />
            <AreaChart
              label={`Credits and payments recorded each day across every shop, the last ${data.days} days`}
              labels={data.activity_days.map((d) => dayLabel(d.day))}
              series={[
                { key: "credits", label: "Credits", color: "var(--owed)", values: credits },
                { key: "payments", label: "Payments", color: "var(--paid)", values: payments },
              ]}
              format={(v) => v.toLocaleString()}
              axis={(v) => (v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : String(Math.round(v)))}
            />
          </CardContent>
        </Card>
        <Subscriptions data={data} />
      </div>

      <div className="grid items-start gap-4 md:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid gap-4 md:gap-5">
          <Attention data={data} />
          <TrialsEnding data={data} />
        </div>
        <MostActive data={data} />
      </div>
    </div>
  )
}
