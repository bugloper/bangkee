import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon, SearchIcon, UsersIcon } from "lucide-react"

import { api } from "@/api/client"
import { Empty, Initial, Money, Panel, Row, Rows } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n"
import { balanceBadge, balanceWord } from "@/lib/ledger"
import { usePage } from "@/lib/page"
import { cn } from "@/lib/utils"

type Search = { q?: string; filter?: string }

export const Route = createFileRoute("/_app/accounts/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    filter: typeof search.filter === "string" && search.filter ? search.filter : undefined,
  }),
  component: Accounts,
})

const FILTERS: [string, string | undefined][] = [
  ["All", undefined],
  ["Outstanding", "outstanding"],
  ["Overdue", "overdue"],
  ["Settled", "settled"],
]

function Accounts() {
  usePage("Customers")
  const t = useT()
  const { q, filter } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data } = useQuery({ queryKey: ["accounts", q ?? "", filter ?? ""], queryFn: () => api.accounts({ q, filter }), placeholderData: (previous) => previous })
  const accounts = data?.accounts ?? []

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="relative flex-1" role="search" onSubmit={(event) => event.preventDefault()}>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name or phone"
            aria-label="Search customers"
            autoComplete="off"
            className="h-11 pl-9"
            defaultValue={q ?? ""}
            onChange={(event) => void navigate({ search: { q: event.target.value || undefined, filter }, replace: true })}
          />
        </form>
        <Link to="/accounts/new" className={buttonVariants({ size: "lg", className: "max-md:hidden" })}>
          <PlusIcon /> Add customer
        </Link>
      </div>

      <nav aria-label="Filter customers" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {FILTERS.map(([label, value]) => (
          <Link
            key={label}
            to="/accounts"
            search={{ q, filter: value }}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === value ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <Panel flush>
        {accounts.length > 0 ? (
          <Rows>
            {accounts.map((account) => (
              <Row
                key={account.id}
                href={`/accounts/${account.id}`}
                leading={<Initial text={account.display_name} tone={account.overdue ? "owed" : "brand"} />}
                title={account.display_name}
                subtitle={account.customer_phone || "No phone"}
                trailing={
                  <>
                    <Money cents={account.balance_cents} tone="auto" />
                    <Badge variant={balanceBadge(account)}>{balanceWord(account, t)}</Badge>
                  </>
                }
              />
            ))}
          </Rows>
        ) : (
          data && (
            <Empty
              icon={UsersIcon}
              title={q || filter ? "No customers match" : "No customers yet"}
              action={
                !(q || filter) && (
                  <Link to="/accounts/new" className={buttonVariants()}>
                    <PlusIcon /> Add customer
                  </Link>
                )
              }
            >
              {q || filter ? "Try a different name, or clear the filter." : "Add your first customer to start the book."}
            </Empty>
          )
        )}
      </Panel>

      <Link
        to="/accounts/new"
        aria-label="Add customer"
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 md:hidden"
      >
        <PlusIcon className="size-6" />
      </Link>
    </div>
  )
}
