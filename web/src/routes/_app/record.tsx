import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { SearchIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import { AppLink } from "@/components/app-link"
import { Empty, Initial, Money, Panel, Row, Rows } from "@/components/kit"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { usePage } from "@/lib/page"

type Kind = "credit" | "payment"

export const Route = createFileRoute("/_app/record")({
  validateSearch: (search: Record<string, unknown>): { kind: Kind } => ({ kind: search.kind === "payment" ? "payment" : "credit" }),
  component: Record,
})

// After the round +: whose book the credit or payment goes in. Those who
// owe most come first — they are the likeliest to be paying.
function Record() {
  const { kind } = Route.useSearch()
  usePage(kind === "payment" ? "Payment from…" : "Credit for…", "/dashboard", { narrow: true })
  const [q, setQ] = useState("")
  const { data } = useQuery({ queryKey: ["accounts", q.trim(), ""], queryFn: () => api.accounts({ q: q.trim() || undefined }), placeholderData: keepPreviousData })
  const accounts = [...(data?.accounts ?? [])].sort((a, b) => b.balance_cents - a.balance_cents)
  const next = (id: number) => (kind === "payment" ? `/accounts/${id}/payments/new` : `/accounts/${id}/credits/new`)

  return (
    <div className="grid gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Search customers" placeholder="Search name or phone" autoFocus className="h-12 rounded-full pl-10" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {data && accounts.length === 0 ? (
        <Panel>
          <Empty
            icon={UsersIcon}
            title={q ? "Nobody by that name" : "No customers yet"}
            action={
              <AppLink href="/accounts/new" className={buttonVariants()}>
                <UserPlusIcon /> Add customer
              </AppLink>
            }
          />
        </Panel>
      ) : (
        <Panel flush>
          <Rows>
            {accounts.map((account) => (
              <Row
                key={account.id}
                href={next(account.id)}
                leading={<Initial text={account.display_name} tone={account.overdue ? "owed" : "brand"} src={account.customer_photo_url} />}
                title={account.display_name}
                subtitle={account.customer_phone ?? "No phone"}
                trailing={<Money cents={account.balance_cents} tone="auto" />}
                chevron
              />
            ))}
          </Rows>
        </Panel>
      )}
    </div>
  )
}
