import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { InboxIcon } from "lucide-react"

import { api } from "@/api/client"
import type { AdminPayment } from "@/api/types"
import { Loading } from "@/components/form"
import { Empty, FilterTabs, Panel } from "@/components/kit"
import { ReviewActions } from "@/components/review"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Thumb } from "@/components/viewer"
import { confirm } from "@/lib/confirm"
import { filterTab } from "@/lib/filter-tab"
import { flashNotice } from "@/lib/flash"
import { coverPeriod, ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { dateTime, dayMonth, longDate } from "@/lib/time"

type Search = { status?: string }

export const Route = createFileRoute("/_admin/subscription_payments")({
  validateSearch: (search: Record<string, unknown>): Search => ({ status: typeof search.status === "string" ? search.status : undefined }),
  component: PaymentQueue,
})

const STATUSES: [string, string][] = [
  ["Pending", "pending"],
  ["Approved", "approved"],
  ["Rejected", "rejected"],
  ["All", "all"],
]

function titleize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// §17 — the operator's queue of owners' manual payments.
function PaymentQueue() {
  usePage("Subscription payments")
  const status = Route.useSearch().status ?? "pending"
  const { data } = useQuery({ queryKey: ["admin", "payments", status], queryFn: () => api.adminPayments(status) })

  return (
    <div className="grid gap-4">
      <FilterTabs label="Filter by status">
        {STATUSES.map(([label, value]) => (
          <Link key={value} to="/subscription_payments" search={{ status: value }} className={filterTab(status === value)}>
            {label}
          </Link>
        ))}
      </FilterTabs>
      {!data ? (
        <Loading />
      ) : data.payments.length > 0 ? (
        <Panel flush>
          <div className="divide-y">
            {data.payments.map((payment) => (
              <Review key={payment.id} payment={payment} />
            ))}
          </div>
        </Panel>
      ) : (
        <Panel>
          <Empty icon={InboxIcon} title={`Nothing ${status === "all" ? "here" : status}`}>
            Owners' payment requests land here for approval.
          </Empty>
        </Panel>
      )}
    </div>
  )
}

function Review({ payment }: { payment: AdminPayment }) {
  const done = async (result: { notice: string }) => {
    flashNotice(result.notice)
    await refreshAll()
  }
  const approve = useMutation({ mutationFn: () => api.approvePayment(payment.id), onSuccess: done })
  const reject = useMutation({ mutationFn: (reason: string) => api.rejectPayment(payment.id, reason), onSuccess: done })
  const period = coverPeriod(payment.months)

  return (
    <div className="flex gap-4 p-4 sm:p-5">
      {payment.screenshot_url && (
        <Thumb url={payment.screenshot_url} caption={`${payment.shop.name} · ${ngultrum(payment.amount_cents)}`} label={`View the screenshot from ${payment.shop.name}`} size={72} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular text-lg font-semibold tracking-tight">{ngultrum(payment.amount_cents)}</span>
          <span className="text-sm text-muted-foreground">
            for {period} of {payment.plan_name}
          </span>
        </div>
        <div className="mt-1 text-sm">
          <span className="font-medium">{payment.shop.name}</span> <span className="text-muted-foreground">· {payment.submitted_by_name} · {dateTime(payment.created_at)}</span>
        </div>
        <div className="mt-0.5 text-[0.8125rem] text-muted-foreground">
          {payment.payment_method || "Method not given"}
          {payment.reference && ` · ref ${payment.reference}`}
        </div>
        <div className="mt-0.5 text-[0.8125rem] text-muted-foreground">
          Paid through {longDate(payment.shop.paid_through)} · {payment.shop.status_label}
        </div>

        {payment.status === "pending" ? (
          <ReviewActions
            className="mt-3"
            approve={
              <Button
                variant="payment"
                disabled={approve.isPending}
                onClick={async () => {
                  const ok = await confirm(`Approve ${ngultrum(payment.amount_cents)}?|${payment.shop.name} is extended by ${period} on ${payment.plan_name}, and any lockout is cleared.`)
                  if (ok) approve.mutate()
                }}
              >
                Approve — extends {period}
              </Button>
            }
            toggleLabel="Reject…"
            reasonLabel="Why are you rejecting it?"
            reasonHint="The owner will see this."
            placeholder="e.g. no transfer received for this reference"
            submitLabel="Reject payment"
            onReject={(reason) => reject.mutate(reason)}
            busy={reject.isPending}
          />
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
            <Badge variant={payment.status === "approved" ? "paid" : "owed"}>{titleize(payment.status)}</Badge>
            <span>
              {payment.reviewed_by_name && `by ${payment.reviewed_by_name}`}
              {payment.reviewed_at && ` on ${dayMonth(payment.reviewed_at)}`}
              {payment.status === "rejected" && payment.rejection_reason && ` · ${payment.rejection_reason}`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
