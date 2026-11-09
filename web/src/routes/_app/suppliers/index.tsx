import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CrownIcon, PlusIcon, TruckIcon } from "lucide-react"

import { api } from "@/api/client"
import { AppLink } from "@/components/app-link"
import { Loading } from "@/components/form"
import { Empty, Initial, Money, Note, Panel, Row, Rows } from "@/components/kit"
import { buttonVariants } from "@/components/ui/button"
import { ngultrum } from "@/lib/money"
import { useCan } from "@/lib/me"
import { usePage } from "@/lib/page"
import { timeAgoInWords } from "@/lib/time"

export const Route = createFileRoute("/_app/suppliers/")({ component: Suppliers })

// The shop's book with the people it buys from: what it owes them. Kept
// apart from the customer book — this total is never added to what
// customers owe.
function Suppliers() {
  usePage("Suppliers", "/dashboard")
  const { data } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers })
  const canManage = useCan("manage")
  if (!data) return <Loading />
  return (
    <div className="grid gap-5">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-[1.25rem] border bg-card p-5 sm:p-6">
        <div>
          <div className="text-sm text-muted-foreground">You owe your suppliers</div>
          <div className="tabular mt-1 text-4xl font-semibold tracking-tight">{ngultrum(data.total_payable_cents)}</div>
          <div className="mt-1 text-sm text-muted-foreground">Separate from what customers owe you.</div>
        </div>
        {data.plan_allows && canManage && (
          <AppLink href="/suppliers/new" className={buttonVariants({ size: "lg", className: "max-sm:w-full" })}>
            <PlusIcon /> Add supplier
          </AppLink>
        )}
      </section>

      {!data.plan_allows && (
        <Note icon={CrownIcon}>
          The supplier book comes with the Pro and Business plans.{" "}
          <AppLink href="/subscription" className="font-medium text-primary hover:underline">
            See plans
          </AppLink>
        </Note>
      )}

      <Panel flush>
        {data.suppliers.length > 0 ? (
          <Rows>
            {data.suppliers.map((supplier) => (
              <Row
                key={supplier.id}
                href={`/suppliers/${supplier.id}`}
                leading={<Initial text={supplier.name} tone="muted" />}
                title={supplier.name}
                subtitle={supplier.last_activity_at ? `Last entry ${timeAgoInWords(supplier.last_activity_at)} ago` : (supplier.phone ?? "No entries yet")}
                trailing={<Money cents={supplier.balance_cents} tone={supplier.balance_cents > 0 ? "owed" : "neutral"} />}
                chevron
              />
            ))}
          </Rows>
        ) : (
          <Empty icon={TruckIcon} title="No suppliers yet">
            Add the wholesalers and distributors you buy from on credit, and keep what you owe them in one place.
          </Empty>
        )}
      </Panel>
    </div>
  )
}
