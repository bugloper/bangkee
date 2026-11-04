import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PrinterIcon, ScrollTextIcon } from "lucide-react"

import { api } from "@/api/client"
import { Loading } from "@/components/form"
import { Empty, Money, Panel, Stat } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { longDate } from "@/lib/time"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/accounts/$id/statement")({ component: StatementScreen })

// A printable statement for one account — the page an owner hands over or a
// customer prints for their own records.
function StatementScreen() {
  const id = Number(Route.useParams().id)
  usePage("Statement", `/accounts/${id}`)
  const { data } = useQuery({ queryKey: ["statement", id], queryFn: () => api.statement(id) })
  if (!data) return <Loading />
  const { account, shop } = data
  const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground first:pl-5 last:pr-5"
  const td = "px-4 py-3 align-top first:pl-5 last:pr-5"

  return (
    <div className="grid gap-6">
      <div className="print-only">
        <div className="text-xl font-bold">{shop.name}</div>
        <div className="text-sm">
          Statement for {account.display_name} · printed {longDate(data.printed_on)}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Statement</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {account.display_name} · {shop.name}
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <PrinterIcon /> Print
        </Button>
      </div>

      <div className="no-print grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total taken on credit" value={ngultrum(data.debit_cents)} tone="owed" />
        <Stat label="Total paid" value={ngultrum(data.credit_cents)} tone="paid" />
        <Stat label="Balance" value={<Money cents={account.balance_cents} tone="auto" className="font-semibold" />} />
      </div>

      <Panel flush className="print-flat">
        {data.rows.length > 0 ? (
          <div className="overflow-x-auto">
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
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className={cn(td, "tabular whitespace-nowrap")}>{longDate(row.occurred_at)}</td>
                    <td className={td}>
                      {row.description || (row.kind === "payment" ? "Payment" : "Goods on credit")}
                      {row.payment_method && <span className="text-muted-foreground"> · {row.payment_method}</span>}
                    </td>
                    <td className={cn(td, "text-muted-foreground")}>{row.created_by_name}</td>
                    <td className={cn(td, "tabular text-right whitespace-nowrap")}>{row.kind === "credit" ? ngultrum(row.amount_cents) : ""}</td>
                    <td className={cn(td, "tabular text-right whitespace-nowrap")}>{row.kind === "payment" ? ngultrum(row.amount_cents) : ""}</td>
                    <td className={cn(td, "tabular text-right font-medium whitespace-nowrap")}>{ngultrum(row.running_balance_cents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 font-semibold">
                <tr>
                  <td className={td} colSpan={3}>
                    Totals
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Money cents={data.debit_cents} tone="owed" className="font-semibold" />
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Money cents={data.credit_cents} tone="paid" className="font-semibold" />
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Money cents={account.balance_cents} tone="auto" className="font-semibold" />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Empty icon={ScrollTextIcon} title="Nothing to show">
            This account has no active transactions.
          </Empty>
        )}
      </Panel>

      <p className="text-[0.8125rem] text-muted-foreground">
        Crossed-out entries are left out. Amounts in Ngultrum.
        {data.viewer === "owner" && ` Questions about this statement go to ${shop.name}.`}
      </p>
    </div>
  )
}
