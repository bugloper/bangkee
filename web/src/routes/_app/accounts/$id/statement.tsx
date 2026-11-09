import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { DownloadIcon, PrinterIcon, ScrollTextIcon, Share2Icon } from "lucide-react"
import { useState } from "react"

import { api, type StatementRange } from "@/api/client"
import type { LedgerEntry } from "@/api/types"
import { Field, Loading, Segmented } from "@/components/form"
import { Empty, Money, Panel, Stat } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { flashAlert } from "@/lib/flash"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { downloadDocument, shareDocument } from "@/lib/share"
import { longDate } from "@/lib/time"
import { cn } from "@/lib/utils"

type Search = { from?: string; to?: string }
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)

export const Route = createFileRoute("/_app/accounts/$id/statement")({
  validateSearch: (search: Record<string, unknown>): Search => ({ from: isDay(search.from) ? search.from : undefined, to: isDay(search.to) ? search.to : undefined }),
  component: StatementScreen,
})

// ------------------------------------------------------------ the range

const PRESETS = ["This month", "Last month", "3 months", "Everything", "Pick dates"] as const
type Preset = (typeof PRESETS)[number]

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

function presetRange(preset: Preset): StatementRange {
  const now = new Date()
  const first = (offset: number) => new Date(now.getFullYear(), now.getMonth() + offset, 1)
  switch (preset) {
    case "This month":
      return { from: ymd(first(0)) }
    case "Last month":
      return { from: ymd(first(-1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) }
    case "3 months":
      return { from: ymd(first(-2)) }
    default:
      return {}
  }
}

function presetOf(range: StatementRange): Preset {
  for (const preset of PRESETS.slice(0, 4)) {
    const candidate = presetRange(preset)
    if (candidate.from === range.from && candidate.to === range.to) return preset
  }
  return "Pick dates"
}

function rangeLabel(range: StatementRange): string {
  if (range.from && range.to) return `${longDate(range.from + "T00:00")} – ${longDate(range.to + "T00:00")}`
  if (range.from) return `Since ${longDate(range.from + "T00:00")}`
  if (range.to) return `Up to ${longDate(range.to + "T00:00")}`
  return "Every entry"
}

// ----------------------------------------------------------- the screen

// One customer's book over a range of days: what they owed going in, every
// entry with the balance after it, what they owe coming out. On a phone the
// entries are a list; on a wider screen, and on paper, a table. The PDF is
// drawn by the server from the same figures.
function StatementScreen() {
  const id = Number(Route.useParams().id)
  const range = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  usePage("Statement", `/accounts/${id}`)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<"download" | "share" | null>(null)
  const { data, isFetching } = useQuery({ queryKey: ["statement", id, range.from ?? "", range.to ?? ""], queryFn: () => api.statement(id, range), placeholderData: keepPreviousData })
  if (!data) return <Loading />
  const { account, shop, statement } = data
  const preset = picking ? "Pick dates" : presetOf(range)
  const setRange = (next: StatementRange) => void navigate({ search: { from: next.from || undefined, to: next.to || undefined }, replace: true })
  const filename = `Statement ${account.display_name} ${range.from ?? "start"} to ${range.to ?? "today"}.pdf`
  const pdfUrl = api.statementPdfUrl(id, range)
  const shareText = `${shop.name} — statement for ${account.display_name} (${rangeLabel(range)}). Balance: ${ngultrum(statement.closing_cents)}.`

  async function run(kind: "download" | "share") {
    setBusy(kind)
    try {
      if (kind === "download") await downloadDocument(pdfUrl, filename)
      else await shareDocument(pdfUrl, filename, shareText)
    } catch (error) {
      flashAlert(error instanceof Error ? error.message : "That statement could not be made.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-6">
      <div className="print-only">
        <div className="text-xl font-bold">{shop.name}</div>
        <div className="text-sm">
          Statement for {account.display_name} · {rangeLabel(range)} · issued {longDate(statement.generated_at)}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Statement</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {account.display_name} · {shop.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("share")} disabled={busy !== null}>
            <Share2Icon /> {busy === "share" ? "Preparing…" : "Share PDF"}
          </Button>
          <Button variant="outline" onClick={() => run("download")} disabled={busy !== null}>
            <DownloadIcon /> {busy === "download" ? "Preparing…" : "Download"}
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="max-sm:hidden">
            <PrinterIcon /> Print
          </Button>
        </div>
      </div>

      <div className="no-print grid gap-3">
        <Segmented
          name="range"
          label="Which days"
          options={PRESETS}
          value={preset}
          onChange={(next) => {
            setPicking(next === "Pick dates")
            if (next !== "Pick dates") setRange(presetRange(next))
          }}
        />
        {preset === "Pick dates" && (
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <Field label="From" htmlFor="from">
              <Input id="from" type="date" value={range.from ?? ""} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} />
            </Field>
            <Field label="To" htmlFor="to">
              <Input id="to" type="date" value={range.to ?? ""} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} />
            </Field>
          </div>
        )}
      </div>

      <div className={cn("grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-4", isFetching && "opacity-60")}>
        <Stat label={range.from ? `Owed on ${longDate(range.from + "T00:00")}` : "Opening balance"} value={ngultrum(statement.opening_cents)} />
        <Stat label="Taken on credit" value={ngultrum(statement.credit_cents)} tone="owed" />
        <Stat label="Paid" value={ngultrum(statement.payment_cents)} tone="paid" />
        <Stat
          label={statement.through_to_today ? "Balance now" : `Owed on ${longDate(range.to + "T00:00")}`}
          value={<Money cents={statement.closing_cents} tone="auto" className="font-semibold" />}
          hint={statement.closing_cents < 0 ? "Paid in advance" : undefined}
        />
      </div>

      <Panel flush className={cn("print-flat transition-opacity", isFetching && "opacity-60")} title={<span className="no-print">{rangeLabel(range)}</span>}>
        {statement.rows.length > 0 ? (
          <>
            <EntryList statement={statement} />
            <EntryTable statement={statement} />
          </>
        ) : (
          <Empty icon={ScrollTextIcon} title="No entries in these days">
            {statement.opening_cents !== 0 ? `The balance stayed at ${ngultrum(statement.opening_cents)}.` : "Choose other days to see entries."}
          </Empty>
        )}
      </Panel>

      <p className="text-[0.8125rem] text-muted-foreground">
        Crossed-out entries are left out, as they are from the balance. Amounts in Ngultrum.
        {data.viewer === "customer" && ` Questions about this statement go to ${shop.name}.`}
      </p>
    </div>
  )
}

type StatementData = Awaited<ReturnType<typeof api.statement>>["statement"]

function describe(row: LedgerEntry) {
  return row.description || (row.kind === "payment" ? "Payment" : "Goods on credit")
}

/** A phone's statement: one entry a line, the balance after it underneath. */
function EntryList({ statement }: { statement: StatementData }) {
  return (
    <div className="divide-y md:hidden print:hidden">
      <div className="flex justify-between px-4 py-2.5 text-[0.8125rem] text-muted-foreground">
        <span>Opening balance</span>
        <span className="tabular">{ngultrum(statement.opening_cents)}</span>
      </div>
      {statement.rows.map((row) => (
        <div key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{describe(row)}</div>
            <div className="text-[0.8125rem] text-muted-foreground">
              {longDate(row.occurred_at)}
              {row.payment_method && ` · ${row.payment_method}`}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={cn("tabular text-sm font-semibold", row.kind === "credit" ? "text-owed" : "text-paid")}>
              {row.kind === "credit" ? "Credit " : "Paid "}
              {ngultrum(row.amount_cents)}
            </div>
            <div className="tabular text-xs text-muted-foreground">Bal {ngultrum(row.running_balance_cents)}</div>
          </div>
        </div>
      ))}
      <div className="flex justify-between px-4 py-3 text-sm font-semibold">
        <span>Closing balance</span>
        <Money cents={statement.closing_cents} tone="auto" className="font-semibold" />
      </div>
    </div>
  )
}

/** A wider screen's, and paper's, statement: the columns a ledger book has. */
function EntryTable({ statement }: { statement: StatementData }) {
  const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground first:pl-5 last:pr-5"
  const td = "px-4 py-3 align-top first:pl-5 last:pr-5"
  return (
    <div className="overflow-x-auto max-md:hidden print:block">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Description</th>
            <th className={th}>Recorded by</th>
            <th className={cn(th, "text-right")}>Credit given</th>
            <th className={cn(th, "text-right")}>Paid</th>
            <th className={cn(th, "text-right")}>Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <tr className="text-muted-foreground">
            <td className={td} colSpan={5}>
              Opening balance
            </td>
            <td className={cn(td, "tabular text-right whitespace-nowrap")}>{ngultrum(statement.opening_cents)}</td>
          </tr>
          {statement.rows.map((row) => (
            <tr key={row.id}>
              <td className={cn(td, "tabular whitespace-nowrap")}>{longDate(row.occurred_at)}</td>
              <td className={td}>
                {describe(row)}
                {row.payment_method && <span className="text-muted-foreground"> · {row.payment_method}</span>}
              </td>
              <td className={cn(td, "text-muted-foreground")}>{row.created_by_name}</td>
              <td className={cn(td, "tabular text-right whitespace-nowrap text-owed")}>{row.kind === "credit" ? ngultrum(row.amount_cents) : ""}</td>
              <td className={cn(td, "tabular text-right whitespace-nowrap text-paid")}>{row.kind === "payment" ? ngultrum(row.amount_cents) : ""}</td>
              <td className={cn(td, "tabular text-right font-medium whitespace-nowrap")}>{ngultrum(row.running_balance_cents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 font-semibold">
          <tr>
            <td className={td} colSpan={3}>
              Closing balance
            </td>
            <td className={cn(td, "text-right")}>
              <Money cents={statement.credit_cents} tone="owed" className="font-semibold" />
            </td>
            <td className={cn(td, "text-right")}>
              <Money cents={statement.payment_cents} tone="paid" className="font-semibold" />
            </td>
            <td className={cn(td, "text-right")}>
              <Money cents={statement.closing_cents} tone="auto" className="font-semibold" />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
