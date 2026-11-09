import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ReceiptTextIcon } from "lucide-react"

import { api } from "@/api/client"
import { Loading } from "@/components/form"
import { Empty, Money, Panel, Row, Rows } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { longDate } from "@/lib/time"

export const Route = createFileRoute("/_app/accounts/$id/receipts")({ component: ReceiptHistory })

// Every payment on the account, each with its receipt, newest first.
function ReceiptHistory() {
  const id = Number(Route.useParams().id)
  usePage("Receipts", `/accounts/${id}`, { narrow: true })
  const { data } = useQuery({ queryKey: ["receipts", id], queryFn: () => api.receipts(id) })
  if (!data) return <Loading />
  return (
    <Panel flush title={`Receipts · ${data.account.display_name}`} description="One for every payment recorded.">
      {data.receipts.length > 0 ? (
        <Rows>
          {data.receipts.map((r) => (
            <Row
              key={r.transaction_id}
              href={`/receipts/${r.transaction_id}`}
              leading={
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-paid/10 text-paid">
                  <ReceiptTextIcon className="size-4" />
                </span>
              }
              title={<span className="font-mono text-[0.8125rem]">{r.number}</span>}
              subtitle={`${longDate(r.paid_at)}${r.payment_method ? ` · ${r.payment_method}` : ""}${r.balance_after_cents != null ? ` · balance ${ngultrum(r.balance_after_cents)}` : ""}`}
              trailing={r.void ? <Badge variant="outline">Void</Badge> : <Money cents={r.amount_cents} tone="paid" />}
              chevron
            />
          ))}
        </Rows>
      ) : (
        <Empty icon={ReceiptTextIcon} title="No payments yet">
          A receipt appears here for each payment.
        </Empty>
      )}
    </Panel>
  )
}
