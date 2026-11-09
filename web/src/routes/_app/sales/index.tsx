import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, Share2Icon, ShoppingBagIcon, StrikethroughIcon } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/api/client"
import type { Sale, SalesDay } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { Loading } from "@/components/form"
import { Empty, Money, Panel } from "@/components/kit"
import { QueuedWrites } from "@/components/queued-writes"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { confirm } from "@/lib/confirm"
import { flashNotice } from "@/lib/flash"
import { useCan, useMe } from "@/lib/me"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { clock, longDate } from "@/lib/time"
import { cn } from "@/lib/utils"

type Search = { day?: string }

export const Route = createFileRoute("/_app/sales/")({
  validateSearch: (search: Record<string, unknown>): Search => ({ day: typeof search.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.day) ? search.day : undefined }),
  component: Sales,
})

function dayName(data: SalesDay["day"]) {
  if (!data.next_day) return "Today"
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const key = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`
  return data.day === key ? "Yesterday" : longDate(`${data.day}T12:00:00+06:00`)
}

/** The day in a few lines, for WhatsApp or a note at closing time. */
function summary(shop: string, name: string, d: SalesDay["day"]) {
  const lines = [`${shop} — ${name === "Today" || name === "Yesterday" ? `${name}, ${longDate(`${d.day}T12:00:00+06:00`)}` : name}`, `Takings: ${ngultrum(d.takings_cents)}`]
  for (const m of d.by_method) lines.push(`  ${m.method} sales: ${ngultrum(m.cents)} (${m.sales})`)
  lines.push(`  Collected on credit: ${ngultrum(d.collected_cents)}`)
  lines.push(`Given on credit: ${ngultrum(d.credit_cents)}`)
  return lines.join("\n")
}

// Sales paid on the spot, a day at a time: what the shop took — sales by how
// they were paid, and what came in on credit — and each sale. Shop-only: no
// customer sees this, and it is in nobody's balance.
function Sales() {
  usePage("Sales")
  const day = Route.useSearch().day
  const me = useMe()
  const canRecord = useCan("record")
  const canManage = useCan("manage")
  const { data } = useQuery({ queryKey: ["sales", day ?? ""], queryFn: () => api.sales(day) })
  if (!data) return <Loading />
  const d = data.day
  const name = dayName(d)

  async function share() {
    const text = summary(me?.shop?.name ?? "Bangkee", name, d)
    try {
      if (navigator.share) return await navigator.share({ text })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast("The day's summary is copied — paste it anywhere.")
    } catch {
      toast("Sharing is not available here.")
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <AppLink href={`/sales?day=${d.previous_day}`} aria-label="The day before" className={buttonVariants({ variant: "outline", size: "icon" })}>
            <ChevronLeftIcon />
          </AppLink>
          <h2 className="min-w-28 px-2 text-center text-lg font-medium tracking-tight">{name}</h2>
          {d.next_day ? (
            <AppLink href={d.next_day ? `/sales?day=${d.next_day}` : "/sales"} aria-label="The day after" className={buttonVariants({ variant: "outline", size: "icon" })}>
              <ChevronRightIcon />
            </AppLink>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "icon" }), "pointer-events-none opacity-40")} aria-hidden="true">
              <ChevronRightIcon />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={share}>
            <Share2Icon /> Share summary
          </Button>
          {canRecord && (
            <AppLink href="/sales/new" className={buttonVariants({ size: "sm" })}>
              <PlusIcon /> New sale
            </AppLink>
          )}
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <p className="text-sm text-muted-foreground">Takings</p>
          <p className="tabular mt-1 text-3xl font-medium tracking-tight text-paid">{ngultrum(d.takings_cents)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {d.sales_count} {d.sales_count === 1 ? "sale" : "sales"} and what came in on credit
          </p>
        </div>
        <dl className="grid gap-2 text-sm">
          {d.by_method.map((m) => (
            <div key={m.method} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {m.method} sales <span className="text-xs">· {m.sales}</span>
              </dt>
              <dd className="tabular font-medium">{ngultrum(m.cents)}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Collected on credit</dt>
            <dd className="tabular font-medium">{ngultrum(d.collected_cents)}</dd>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 border-t pt-2">
            <dt className="text-muted-foreground">Given on credit (not takings)</dt>
            <dd className="tabular font-medium text-owed">{ngultrum(d.credit_cents)}</dd>
          </div>
        </dl>
      </section>

      <QueuedWrites queueKey="sales" caption="These sales are on this phone only — they reach your takings once you are back online." />

      <Panel flush title="Sales">
        {d.sales.length > 0 ? (
          <div className="divide-y">
            {d.sales.map((sale) => (
              <SaleRow key={sale.id} sale={sale} canManage={canManage} />
            ))}
          </div>
        ) : (
          <Empty icon={ShoppingBagIcon} title={name === "Today" ? "No sales yet today" : "No sales that day"}>
            Record what customers pay for on the spot. It counts in your takings, never in anyone's credit.
          </Empty>
        )}
      </Panel>
    </div>
  )
}

function SaleRow({ sale, canManage }: { sale: Sale; canManage: boolean }) {
  const crossOut = useMutation({
    mutationFn: () => api.crossOutSale(sale.id),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })
  const what = sale.items.length > 0 ? sale.items.map((it) => (Number(it.quantity) === 1 ? it.name : `${it.name} × ${Number(it.quantity)}`)).join(", ") : sale.description || "Sale"
  return (
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-paid/10 text-paid">
        <ShoppingBagIcon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm font-medium", sale.crossed_out && "text-muted-foreground line-through")}>{what}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{clock(sale.occurred_at)}</span>
          <Badge variant="muted">{sale.payment_method}</Badge>
          {sale.customer_name && sale.account_id && (
            <AppLink href={`/accounts/${sale.account_id}`} className="text-primary hover:underline">
              {sale.customer_name}
            </AppLink>
          )}
          <span>by {sale.created_by_name}</span>
          {sale.crossed_out && <Badge variant="owed">Crossed out</Badge>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Money cents={sale.amount_cents} tone={sale.crossed_out ? "neutral" : "paid"} className={cn("text-sm font-semibold", sale.crossed_out && "line-through")} />
        {canManage && !sale.crossed_out && (
          <button
            type="button"
            disabled={crossOut.isPending}
            onClick={async () => {
              if (await confirm("Cross out this sale?|It stays on the record but leaves the takings.", { danger: true })) crossOut.mutate()
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <StrikethroughIcon className="size-3" /> Cross out
          </button>
        )}
      </div>
    </div>
  )
}
