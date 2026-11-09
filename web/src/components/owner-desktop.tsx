import { useQuery } from "@tanstack/react-query"
import { AlarmClockIcon, ArrowDownLeftIcon, ArrowRightIcon, ArrowUpRightIcon, BarChart3Icon, CircleAlertIcon, FlagIcon, SearchIcon, UserPlusIcon, WalletIcon, type LucideIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { LedgerEntry, Me, OwnerDashboard } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { AreaChart } from "@/components/area-chart"
import { Initial, Money } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { go } from "@/lib/go"
import { ngultrum, pluralize } from "@/lib/money"
import { timeAgoInWords } from "@/lib/time"
import { cn } from "@/lib/utils"

// The owner's home on a desktop, after Square UI and shadcn-admin: a
// greeting with the two things to do, four figures with icon tiles, the
// fortnight's money in and out beside what just happened, anything that
// needs looking at, and the customers who owe as a table. A phone keeps its
// own home (dashboard.tsx).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayLabel = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-xl border bg-card", className)}>{children}</section>
}

function CardHead({ icon: Icon, title, action }: { icon: LucideIcon; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-[0.9375rem] tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function Figure({ label, value, icon: Icon, note, tone, href }: { label: string; value: React.ReactNode; icon: LucideIcon; note: React.ReactNode; tone?: "owed" | "paid" | "warn"; href?: string }) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={cn("tabular text-2xl font-medium tracking-tight", tone === "owed" && "text-owed", tone === "paid" && "text-paid", tone === "warn" && "text-warn")}>{value}</p>
        <p className="truncate text-xs text-muted-foreground">{note}</p>
      </div>
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
    </div>
  )
  const classes = "block rounded-xl border bg-card p-4"
  return href ? (
    <AppLink href={href} className={cn(classes, "transition-colors hover:bg-muted/40")}>
      {body}
    </AppLink>
  ) : (
    <div className={classes}>{body}</div>
  )
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className="size-2.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  )
}

function Direction({ kind }: { kind: LedgerEntry["kind"] }) {
  const Icon = kind === "credit" ? ArrowUpRightIcon : ArrowDownLeftIcon
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", kind === "credit" ? "bg-owed/10 text-owed" : "bg-paid/10 text-paid")}>
      <Icon className="size-3.5" />
    </span>
  )
}

/** The customers who owe, as a table, searchable. */
function Owing({ data }: { data: OwnerDashboard }) {
  const [query, setQuery] = useState("")
  const { data: list } = useQuery({ queryKey: ["accounts", "", "outstanding"], queryFn: () => api.accounts({ filter: "outstanding" }) })
  const q = query.trim().toLowerCase()
  const rows = (list?.accounts ?? []).filter((a) => !q || a.display_name.toLowerCase().includes(q) || (a.customer_phone ?? "").includes(q)).slice(0, 10)
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <WalletIcon className="size-4 text-muted-foreground" />
          <h2 className="text-[0.9375rem] tracking-tight">Who owes you</h2>
          <span className="tabular rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{data.owing_count}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or phone" aria-label="Search who owes" className="h-8 pl-8 text-sm" />
          </div>
          <AppLink href="/accounts?filter=outstanding" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View all
          </AppLink>
        </div>
      </div>
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-5">Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last entry</TableHead>
              <TableHead className="pr-5 text-right">Owes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => go(`/accounts/${a.id}`)}>
                <TableCell className="pl-5">
                  <AppLink href={`/accounts/${a.id}`} className="flex items-center gap-2.5 font-medium">
                    <Initial text={a.display_name} size="sm" src={a.customer_photo_url} />
                    {a.display_name}
                  </AppLink>
                </TableCell>
                <TableCell className="tabular text-muted-foreground">{a.customer_phone ?? "—"}</TableCell>
                <TableCell>
                  {a.overdue ? (
                    <Badge variant="warn">{pluralize(a.days_overdue, "day")} overdue</Badge>
                  ) : a.joined ? (
                    <Badge variant="outline">Joined</Badge>
                  ) : (
                    <Badge variant="muted">Not joined</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{a.last_activity_at ? `${timeAgoInWords(a.last_activity_at)} ago` : "—"}</TableCell>
                <TableCell className="pr-5 text-right">
                  <Money cents={a.balance_cents} tone="owed" className="font-semibold" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="px-5 pb-6 text-sm text-muted-foreground">{list ? (q ? "No one matches." : "Nobody owes you anything.") : "Loading…"}</p>
      )}
    </Card>
  )
}

export function OwnerDesktop({ data, me, className }: { data: OwnerDashboard; me: Me; className?: string }) {
  const first = me.user.display_name.split(" ")[0]
  const credits = data.trend.map((d) => d.credit_cents)
  const payments = data.trend.map((d) => d.payment_cents)
  const attention = [
    data.disputed.length > 0 && {
      icon: FlagIcon,
      tone: "bg-owed/10 text-owed",
      title: `${pluralize(data.disputed.length, "entry", "entries")} flagged by customers`,
      href: `/accounts/${data.disputed[0].account.id}?entry=${data.disputed[0].id}`,
    },
    data.late_installments.length > 0 && {
      icon: AlarmClockIcon,
      tone: "bg-warn/10 text-warn",
      title: `${pluralize(data.late_installments.length, "installment plan")} with a late payment`,
      href: `/accounts/${data.late_installments[0].account_id}/installments`,
    },
    data.overdue_count > 0 && {
      icon: CircleAlertIcon,
      tone: "bg-warn/10 text-warn",
      title: `${pluralize(data.overdue_count, "customer")} overdue · ${ngultrum(data.overdue_cents)}`,
      href: "/accounts?filter=overdue",
    },
  ].filter(Boolean) as { icon: LucideIcon; tone: string; title: string; href: string }[]

  return (
    <div className={cn("gap-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">
            {greeting()}, {first}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data.shop.name} · {pluralize(data.customers_count, "customer")} in your book
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AppLink href="/insights" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <BarChart3Icon /> Insights
          </AppLink>
          {me.permissions.includes("record") && (
            <AppLink href="/accounts/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <UserPlusIcon /> Add customer
            </AppLink>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Figure label="Owed to you" value={ngultrum(data.total_outstanding_cents)} icon={WalletIcon} note={`by ${pluralize(data.owing_count, "customer")}`} href="/accounts?filter=outstanding" />
        <Figure label="Collected today" value={ngultrum(data.payments_today_cents)} icon={ArrowDownLeftIcon} tone="paid" note={`${ngultrum(data.repaid_month_cents)} this month`} />
        <Figure label="Credit given today" value={ngultrum(data.credit_today_cents)} icon={ArrowUpRightIcon} tone="owed" note="Goods taken on credit" />
        <Figure
          label="Overdue"
          value={ngultrum(data.overdue_cents)}
          icon={AlarmClockIcon}
          tone={data.overdue_count > 0 ? "warn" : undefined}
          note={data.overdue_count > 0 ? `${pluralize(data.overdue_count, "customer")} past ${data.shop.credit_due_days} days` : "Nobody is overdue"}
          href="/accounts?filter=overdue"
        />
      </div>

      {attention.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-3">
          {attention.map((item) => (
            <AppLink key={item.title} href={item.href} className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", item.tone)}>
                <item.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
              <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </AppLink>
          ))}
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHead icon={BarChart3Icon} title="Money in and out" action={<span className="rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">Last 14 days</span>} />
          <div className="px-5 pb-5">
            <div className="mb-3 flex items-center justify-center gap-5">
              <Dot color="var(--paid)" label={`Collected · ${ngultrum(payments.reduce((s, v) => s + v, 0))}`} />
              <Dot color="var(--owed)" label={`Credit given · ${ngultrum(credits.reduce((s, v) => s + v, 0))}`} />
            </div>
            <AreaChart
              height={230}
              label="Money collected and credit given each day, the last 14 days"
              labels={data.trend.map((d) => dayLabel(d.day))}
              series={[
                { key: "payments", label: "Collected", color: "var(--paid)", values: payments },
                { key: "credits", label: "Credit given", color: "var(--owed)", values: credits },
              ]}
              format={(cents) => ngultrum(cents)}
              axis={(cents) => (cents >= 100_000 ? `${Number((cents / 100_000).toFixed(1))}k` : String(Math.round(cents / 100)))}
            />
          </div>
        </Card>

        <Card>
          <CardHead
            icon={ArrowDownLeftIcon}
            title="Recent activity"
            action={
              <AppLink href="/insights?view=credit" className="text-xs font-medium text-primary hover:underline">
                See all
              </AppLink>
            }
          />
          {data.recent_transactions.length > 0 ? (
            <div className="divide-y border-t">
              {data.recent_transactions.map((entry) => (
                <AppLink key={entry.id} href={`/accounts/${entry.account.id}?entry=${entry.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                  <Direction kind={entry.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.account.display_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.description || entry.payment_method || (entry.kind === "credit" ? "Credit" : "Payment")} · {timeAgoInWords(entry.occurred_at)} ago
                    </span>
                  </span>
                  <Money cents={entry.signed_amount_cents} signed tone={entry.kind === "credit" ? "owed" : "paid"} className="text-sm" />
                </AppLink>
              ))}
            </div>
          ) : (
            <p className="px-5 pb-6 text-sm text-muted-foreground">Nothing recorded yet. Add a customer, then record their first credit.</p>
          )}
        </Card>
      </div>

      <Owing data={data} />
    </div>
  )
}
