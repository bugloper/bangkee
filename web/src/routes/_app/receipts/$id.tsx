import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { BadgeCheckIcon, CircleSlashIcon } from "lucide-react"

import { api } from "@/api/client"
import { DocumentActions } from "@/components/document-actions"
import { Loading } from "@/components/form"
import { KV, Note, Panel } from "@/components/kit"
import { useMe } from "@/lib/me"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { longDate, longDateTime } from "@/lib/time"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/receipts/$id")({ component: ReceiptScreen })

// One payment's receipt: what the customer paid, how, and what they owed
// right after. The PDF is the same receipt, drawn by the server.
function ReceiptScreen() {
  const id = Number(Route.useParams().id)
  const me = useMe()
  const { data } = useQuery({ queryKey: ["receipt", id], queryFn: () => api.receipt(id) })
  usePage("Receipt", data ? `/accounts/${data.receipt.account_id}/receipts` : "/dashboard", { narrow: true })
  if (!data) return <Loading />
  const r = data.receipt
  const owner = me?.user.role === "shop_owner"
  const text =
    `${r.shop_name} — receipt ${r.number}: ${ngultrum(r.amount_cents)} received from ${r.customer_name} on ${longDate(r.paid_at)}.` +
    (r.balance_after_cents != null ? ` Balance after this payment: ${ngultrum(r.balance_after_cents)}.` : "")

  return (
    <div className="grid gap-5">
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold tracking-tight">{r.shop_name}</div>
            {r.shop_line && <div className="text-sm text-muted-foreground">{r.shop_line}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold tracking-wide text-primary uppercase">Receipt</div>
            <div className="tabular font-mono text-sm">{r.number}</div>
          </div>
        </div>

        {r.void && (
          <Note tone="warn" icon={CircleSlashIcon} className="mt-5">
            Void — the shop crossed this payment out{r.voided_at && ` on ${longDate(r.voided_at)}`}. It no longer counts toward the balance.
          </Note>
        )}

        <div className="mt-6 text-sm text-muted-foreground">Amount paid by {r.customer_name}</div>
        <div className={cn("tabular mt-1 text-4xl font-semibold tracking-tight", r.void ? "text-muted-foreground line-through" : "text-paid")}>{ngultrum(r.amount_cents)}</div>

        <div className="mt-6 divide-y">
          <KV label="Paid on">{longDateTime(r.paid_at)}</KV>
          <KV label="Paid by">{r.payment_method || "Not recorded"}</KV>
          <KV label="Received by">{r.received_by}</KV>
          {r.balance_after_cents != null && (
            <KV label="Balance after this payment">
              <span className="tabular font-semibold">{ngultrum(r.balance_after_cents)}</span>
              {r.balance_after_cents === 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-paid">
                  <BadgeCheckIcon className="size-4" /> Settled
                </span>
              )}
              {r.balance_after_cents < 0 && <span className="ml-2 text-muted-foreground">paid in advance</span>}
            </KV>
          )}
          {r.notes && <KV label="Notes">{r.notes}</KV>}
        </div>
      </Panel>

      <DocumentActions url={api.receiptPdfUrl(r.transaction_id)} filename={`Receipt ${r.number}.pdf`} text={text} whatsappTo={owner ? r.customer_phone : null} />
      <p className="text-[0.8125rem] text-muted-foreground">The balance shown is as it stood right after this payment. Later entries change it.</p>
    </div>
  )
}
