import { useQuery } from "@tanstack/react-query"
import { CircleCheckBigIcon, MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { AdminDashboard } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { AreaChart } from "@/components/area-chart"
import { Loading } from "@/components/form"
import { Empty, Initial } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { coverPeriod, ngultrum, pluralize } from "@/lib/money"
import { usePage } from "@/lib/page"
import { dayMonth, longDate } from "@/lib/time"
import { cn } from "@/lib/utils"

// The console's front page, after shadcn's dashboard: four figures with how
// they moved since last month, money approved over time, where the shops
// stand, and the work waiting — all from /api/admin/dashboard.

/** How a figure moved from last month: "+12%", "−20%", "new", or level. */
function change(now: number, before: number): { text: string; direction: "up" | "down" | "flat" } {
  if (now === before) return { text: "Level", direction: "flat" }
  if (before === 0) return { text: "New", direction: "up" }
  const percent = Math.round(((now - before) / before) * 100)
  return { text: `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`, direction: percent >= 0 ? "up" : "down" }
}

function Trend({ now, before }: { now: number; before: number }) {
  const { text, direction } = change(now, before)
  const Icon = direction === "up" ? TrendingUpIcon : direction === "down" ? TrendingDownIcon : MinusIcon
  return (
    <Badge variant="outline" className="gap-1">
      <Icon className="size-3.5" /> {text}
    </Badge>
  )
}

function Figure({ label, value, action, line, note }: { label: string; value: React.ReactNode; action?: React.ReactNode; line: React.ReactNode; note: string }) {
  return (
    <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="tabular text-2xl font-semibold tracking-tight @[250px]/card:text-3xl">{value}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1 border-t-0 bg-transparent pb-4 text-sm">
        <div className="flex items-center gap-1.5 font-medium">{line}</div>
        <div className="text-muted-foreground">{note}</div>
      </CardFooter>
    </Card>
  )
}

const RANGES = [
  [3, "3 mo"],
  [6, "6 mo"],
  [12, "12 mo"],
] as const

function MoneyChart({ months }: { months: AdminDashboard["months"] }) {
  const [range, setRange] = useState<number>(6)
  const shown = months.slice(-range)
  const total = shown.reduce((sum, m) => sum + m.approved_cents, 0)
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>Subscription money approved</CardTitle>
        <CardDescription>
          {ngultrum(total)} over the last {range} months
        </CardDescription>
        <CardAction>
          <div role="radiogroup" aria-label="How far back" className="inline-flex rounded-lg border p-0.5">
            {RANGES.map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={range === value}
                aria-label={`Last ${value} months`}
                onClick={() => setRange(value)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", range === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {text}
              </button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <AreaChart
          label={`Subscription money approved each month, the last ${range} months`}
          points={shown.map((m) => ({ key: m.month, label: m.label, value: m.approved_cents, detail: pluralize(m.new_shops, "new shop") }))}
          format={(cents) => ngultrum(cents)}
          axis={(cents) => (cents >= 100_000 ? `${Number((cents / 100_000).toFixed(1))}k` : String(Math.round(cents / 100)))}
        />
      </CardContent>
    </Card>
  )
}

const MIX: [keyof AdminDashboard["plan_mix"], string][] = [
  ["trialing", "Free trial"],
  ["basic", "Basic"],
  ["pro", "Pro"],
  ["business", "Business"],
  ["past_due", "Payment due"],
  ["disabled", "Locked"],
]

function PlanMix({ mix, total }: { mix: AdminDashboard["plan_mix"]; total: number }) {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>Shops by plan</CardTitle>
        <CardDescription>{pluralize(total, "shop")} on Bangkee</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3.5">
        {MIX.map(([key, label]) => {
          const count = mix[key]
          const share = total > 0 ? count / total : 0
          return (
            <div key={key} className="grid gap-1.5">
              <div className="flex items-baseline justify-between text-sm">
                <span className={cn(key === "disabled" && count > 0 && "text-owed", key === "past_due" && count > 0 && "text-warn")}>{label}</span>
                <span className="tabular font-medium">
                  {count}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{Math.round(share * 100)}%</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-primary/80" style={{ width: `${share * 100}%` }} />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function NewestShops() {
  const { data } = useQuery({ queryKey: ["admin", "shops"], queryFn: api.adminShops })
  if (!data) return <Loading />
  const newest = [...data.shops].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Shop</TableHead>
          <TableHead className="max-md:hidden">Owner</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead className="text-right">Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {newest.map((shop) => (
          <TableRow key={shop.id}>
            <TableCell className="font-medium">{shop.name}</TableCell>
            <TableCell className="text-muted-foreground max-md:hidden">{shop.owner_name}</TableCell>
            <TableCell>{shop.subscription ? <Badge variant="outline">{shop.subscription.status === "trialing" ? "Trial" : shop.subscription.plan_name}</Badge> : "—"}</TableCell>
            <TableCell className="tabular text-right text-muted-foreground">{longDate(shop.created_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function AdminOverview() {
  usePage("Overview")
  const { data } = useQuery({ queryKey: ["admin", "dashboard"], queryFn: api.adminDashboard })
  if (!data) return <Loading />

  return (
    <div className="grid gap-4 md:gap-6">
      <div className="grid grid-cols-1 gap-4 *:@container/card sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label="Approved this month"
          value={ngultrum(data.approved_month_cents)}
          action={<Trend now={data.approved_month_cents} before={data.approved_last_month_cents} />}
          line={`${ngultrum(data.approved_last_month_cents)} last month`}
          note="Subscription payments approved"
        />
        <Figure
          label="New shops this month"
          value={data.new_shops_month}
          action={<Trend now={data.new_shops_month} before={data.new_shops_last_month} />}
          line={`${data.new_shops_last_month} last month`}
          note="Opened a book on Bangkee"
        />
        <Figure
          label="Paying shops"
          value={data.paying_count}
          action={<Badge variant="outline">{data.shops_count > 0 ? Math.round((data.paying_count / data.shops_count) * 100) : 0}%</Badge>}
          line={`${data.trialing_count} on free trial`}
          note={data.locked_count > 0 ? `${pluralize(data.locked_count, "shop")} write-locked` : "No shop is locked"}
        />
        <Figure
          label="Payments to review"
          value={data.pending_count}
          action={data.pending_count > 0 ? <Badge variant="warn">Waiting</Badge> : <Badge variant="outline">Clear</Badge>}
          line={
            data.pending_count > 0 ? (
              <AppLink href="/subscription_payments" className="text-primary hover:underline">
                Review the queue
              </AppLink>
            ) : (
              "Nothing waiting"
            )
          }
          note="Approve within one working day"
        />
      </div>

      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MoneyChart months={data.months} />
        <PlanMix mix={data.plan_mix} total={data.shops_count} />
      </div>

      <Tabs defaultValue="review" className="flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="review">
              Waiting for review {data.pending_count > 0 && <Badge variant="brand">{data.pending_count}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="shops">Newest shops</TabsTrigger>
          </TabsList>
          <AppLink href="/subscription_payments" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open payments
          </AppLink>
        </div>
        <TabsContent value="review">
          <Card className="py-0 shadow-xs">
            {data.pending.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shop</TableHead>
                    <TableHead className="max-md:hidden">Sent by</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="max-sm:hidden">Sent</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pending.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <Initial text={payment.shop.name} size="sm" />
                          <span className="font-medium">{payment.shop.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-md:hidden">{payment.submitted_by_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {payment.plan_name} · {coverPeriod(payment.months)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-sm:hidden">{dayMonth(payment.created_at)}</TableCell>
                      <TableCell className="tabular text-right font-medium">{ngultrum(payment.amount_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Empty icon={CircleCheckBigIcon} title="Queue is clear">
                Nothing is waiting on Bangkee.
              </Empty>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="shops">
          <Card className="py-0 shadow-xs">
            <NewestShops />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
