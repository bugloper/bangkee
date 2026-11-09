import { PrinterIcon, ScrollTextIcon } from "lucide-react"
import { useState } from "react"

import type { StatementRange } from "@/api/client"
import type { LedgerEntry, Statement } from "@/api/types"
import { DocumentActions } from "@/components/document-actions"
import { Field, Segmented } from "@/components/form"
import { Empty, Money, Panel, Stat } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ngultrum } from "@/lib/money"
import { longDate } from "@/lib/time"
import { presetOf, presetRange, PRESETS, rangeLabel } from "@/lib/statement-range"
import { cn } from "@/lib/utils"

// A book over a range of days — a customer's, or the shop's with a supplier:
// what was owed going in, every entry with the balance after it, what is owed
// coming out. On a phone the entries are a list; on a wider screen, and on
// paper, a table. The PDF is drawn by the server from the same figures.

type StatementData = Statement["statement"]

/** The words that differ between a customer's book and a supplier's. */
export interface BookWords {
  taken: string // "Taken on credit" | "Bought on credit"
  takenColumn: string // "Credit given" | "Bought"
  takenEntry: string // what an entry with no description is: "Goods on credit"
}

export function StatementView({
  statement,
  range,
  onRange,
  isFetching,
  heading,
  printLine,
  words,
  pdfUrl,
  filename,
  shareText,
  whatsappTo,
  footnote,
  showRecordedBy = true,
}: {
  statement: StatementData
  range: StatementRange
  onRange: (next: StatementRange) => void
  isFetching: boolean
  heading: React.ReactNode
  printLine: React.ReactNode
  words: BookWords
  pdfUrl: string
  filename: string
  shareText: string
  whatsappTo?: string | null
  footnote: React.ReactNode
  showRecordedBy?: boolean
}) {
  const [picking, setPicking] = useState(false)
  const preset = picking ? "Pick dates" : presetOf(range)

  return (
    <div className="grid gap-6">
      <div className="print-only">{printLine}</div>

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>{heading}</div>
        <div className="flex flex-wrap gap-2">
          <DocumentActions url={pdfUrl} filename={filename} text={shareText} whatsappTo={whatsappTo} />
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
            if (next !== "Pick dates") onRange(presetRange(next))
          }}
        />
        {preset === "Pick dates" && (
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <Field label="From" htmlFor="from">
              <Input id="from" type="date" value={range.from ?? ""} max={range.to} onChange={(event) => onRange({ ...range, from: event.target.value })} />
            </Field>
            <Field label="To" htmlFor="to">
              <Input id="to" type="date" value={range.to ?? ""} min={range.from} onChange={(event) => onRange({ ...range, to: event.target.value })} />
            </Field>
          </div>
        )}
      </div>

      <div className={cn("grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-4", isFetching && "opacity-60")}>
        <Stat label={range.from ? `Owed on ${longDate(range.from + "T00:00")}` : "Opening balance"} value={ngultrum(statement.opening_cents)} />
        <Stat label={words.taken} value={ngultrum(statement.credit_cents)} tone="owed" />
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
            <EntryList statement={statement} words={words} />
            <EntryTable statement={statement} words={words} showRecordedBy={showRecordedBy} />
          </>
        ) : (
          <Empty icon={ScrollTextIcon} title="No entries in these days">
            {statement.opening_cents !== 0 ? `The balance stayed at ${ngultrum(statement.opening_cents)}.` : "Choose other days to see entries."}
          </Empty>
        )}
      </Panel>

      <p className="text-[0.8125rem] text-muted-foreground">{footnote}</p>
    </div>
  )
}

function describe(row: LedgerEntry, words: BookWords) {
  return row.description || (row.kind === "payment" ? "Payment" : words.takenEntry)
}
const adds = (row: LedgerEntry) => row.signed_amount_cents > 0

/** A phone's statement: one entry a line, the balance after it underneath. */
function EntryList({ statement, words }: { statement: StatementData; words: BookWords }) {
  return (
    <div className="divide-y md:hidden print:hidden">
      <div className="flex justify-between px-4 py-2.5 text-[0.8125rem] text-muted-foreground">
        <span>Opening balance</span>
        <span className="tabular">{ngultrum(statement.opening_cents)}</span>
      </div>
      {statement.rows.map((row) => (
        <div key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{describe(row, words)}</div>
            <div className="text-[0.8125rem] text-muted-foreground">
              {longDate(row.occurred_at)}
              {row.payment_method && ` · ${row.payment_method}`}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={cn("tabular text-sm font-semibold", adds(row) ? "text-owed" : "text-paid")}>
              {adds(row) ? `${words.takenColumn} ` : "Paid "}
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
function EntryTable({ statement, words, showRecordedBy }: { statement: StatementData; words: BookWords; showRecordedBy: boolean }) {
  const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground first:pl-5 last:pr-5"
  const td = "px-4 py-3 align-top first:pl-5 last:pr-5"
  return (
    <div className="overflow-x-auto max-md:hidden print:block">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Description</th>
            {showRecordedBy && <th className={th}>Recorded by</th>}
            <th className={cn(th, "text-right")}>{words.takenColumn}</th>
            <th className={cn(th, "text-right")}>Paid</th>
            <th className={cn(th, "text-right")}>Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <tr className="text-muted-foreground">
            <td className={td} colSpan={showRecordedBy ? 5 : 4}>
              Opening balance
            </td>
            <td className={cn(td, "tabular text-right whitespace-nowrap")}>{ngultrum(statement.opening_cents)}</td>
          </tr>
          {statement.rows.map((row) => (
            <tr key={row.id}>
              <td className={cn(td, "tabular whitespace-nowrap")}>{longDate(row.occurred_at)}</td>
              <td className={td}>
                {describe(row, words)}
                {row.payment_method && <span className="text-muted-foreground"> · {row.payment_method}</span>}
              </td>
              {showRecordedBy && <td className={cn(td, "text-muted-foreground")}>{row.created_by_name}</td>}
              <td className={cn(td, "tabular text-right whitespace-nowrap text-owed")}>{adds(row) ? ngultrum(row.amount_cents) : ""}</td>
              <td className={cn(td, "tabular text-right whitespace-nowrap text-paid")}>{adds(row) ? "" : ngultrum(row.amount_cents)}</td>
              <td className={cn(td, "tabular text-right font-medium whitespace-nowrap")}>{ngultrum(row.running_balance_cents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 font-semibold">
          <tr>
            <td className={td} colSpan={showRecordedBy ? 3 : 2}>
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
