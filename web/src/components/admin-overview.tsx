import { useQuery } from "@tanstack/react-query"
import { CircleCheckBigIcon } from "lucide-react"

import { api } from "@/api/client"
import { Loading } from "@/components/form"
import { Count, Empty, Initial, Money, Panel, Row, Rows, Stat, StatGrid } from "@/components/kit"
import { buttonVariants } from "@/components/ui/button"
import { AppLink } from "@/components/app-link"
import { coverPeriod, ngultrum, pluralize } from "@/lib/money"
import { usePage } from "@/lib/page"
import { dayMonth } from "@/lib/time"

/** The console's front page: money in, and what is waiting on Bangkee. */
export function AdminOverview() {
  usePage("Overview")
  const { data } = useQuery({ queryKey: ["admin", "dashboard"], queryFn: api.adminDashboard })
  if (!data) return <Loading />

  return (
    <div className="grid gap-6">
      <StatGrid>
        <Stat label="Approved this month" value={ngultrum(data.approved_month_cents)} tone="paid" hint={`${pluralize(data.shops_count, "shop")} on Bangkee`} />
        <Stat label="Payments to review" value={data.pending_count} tone={data.pending_count > 0 ? "warn" : undefined} href="/subscription_payments" />
        <Stat label="Shops" value={data.shops_count} href="/shops" />
        <Stat label="Write-locked" value={data.locked_count} tone={data.locked_count > 0 ? "owed" : undefined} />
      </StatGrid>

      <Panel
        flush
        title={
          <span className="flex items-center gap-2">
            Waiting for review {data.pending_count > 0 && <Count tone="brand">{data.pending_count}</Count>}
          </span>
        }
        action={
          data.pending_count > 0 && (
            <AppLink href="/subscription_payments" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Review all
            </AppLink>
          )
        }
      >
        {data.pending.length > 0 ? (
          <Rows>
            {data.pending.map((payment) => (
              <Row
                key={payment.id}
                href="/subscription_payments"
                leading={<Initial text={payment.shop.name} />}
                title={payment.shop.name}
                subtitle={`${payment.submitted_by_name} · ${coverPeriod(payment.months)} · ${dayMonth(payment.created_at)}`}
                trailing={<Money cents={payment.amount_cents} />}
                chevron
              />
            ))}
          </Rows>
        ) : (
          <Empty icon={CircleCheckBigIcon} title="Queue is clear">
            Nothing is waiting on Bangkee.
          </Empty>
        )}
      </Panel>
    </div>
  )
}
