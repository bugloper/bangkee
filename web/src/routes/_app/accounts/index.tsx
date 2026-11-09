import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { BellRingIcon, PlusIcon, SearchIcon, UsersIcon } from "lucide-react"

import { api } from "@/api/client"
import { Empty, Initial, Money, Panel, Row, Rows } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { flashNotice } from "@/lib/flash"
import { useT } from "@/lib/i18n"
import { balanceBadge, balanceWord } from "@/lib/ledger"
import { useFeature } from "@/lib/me"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { timeAgoInWords } from "@/lib/time"
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
  const bulk = useFeature("bulk_reminders")

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

      {filter === "overdue" && accounts.length > 0 && bulk && <RemindAll count={accounts.length} />}

      <Panel flush>
        {accounts.length > 0 ? (
          <>
            {/* A desktop has room for a table; a phone keeps the list. */}
            <div className="hidden md:block" role="table" aria-label="Customers">
              <div role="row" className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_8rem] items-center gap-4 border-b px-5 py-3 text-xs font-medium text-muted-foreground">
                <span role="columnheader">Customer</span>
                <span role="columnheader">Phone</span>
                <span role="columnheader">Last activity</span>
                <span role="columnheader">Status</span>
                <span role="columnheader" className="text-right">
                  Balance
                </span>
              </div>
              {accounts.map((account) => (
                <Link
                  key={account.id}
                  to="/accounts/$id"
                  params={{ id: String(account.id) }}
                  role="row"
                  className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_8rem] items-center gap-4 border-b px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/50"
                >
                  <span role="cell" className="flex min-w-0 items-center gap-3">
                    <Initial text={account.display_name} size="sm" tone={account.overdue ? "owed" : "brand"} src={account.customer_photo_url} />
                    <span className="truncate font-medium">{account.display_name}</span>
                  </span>
                  <span role="cell" className="tabular truncate text-muted-foreground">
                    {account.customer_phone || "—"}
                  </span>
                  <span role="cell" className="truncate text-muted-foreground">
                    {account.last_activity_at ? timeAgoInWords(account.last_activity_at) : "—"}
                  </span>
                  <span role="cell">
                    <Badge variant={balanceBadge(account)}>{balanceWord(account, t)}</Badge>
                  </span>
                  <span role="cell" className="text-right font-semibold">
                    <Money cents={account.balance_cents} tone="auto" />
                  </span>
                </Link>
              ))}
            </div>
            <Rows className="md:hidden">
              {accounts.map((account) => (
                <Row
                  key={account.id}
                  href={`/accounts/${account.id}`}
                  leading={<Initial text={account.display_name} tone={account.overdue ? "owed" : "brand"} src={account.customer_photo_url} />}
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
          </>
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

/** On the overdue list: remind everyone on it at once, through Bangkee. */
function RemindAll({ count }: { count: number }) {
  const remind = useMutation({
    mutationFn: () => api.remindAllOverdue(),
    onSuccess: async (result) => {
      const skipped = result.outcomes.filter((o) => o.status === "skipped" || o.status === "failed").length
      flashNotice(skipped > 0 ? `${result.notice} ${skipped} could not be reminded through Bangkee — open them to remind by WhatsApp or SMS.` : result.notice)
      await refreshAll()
    },
  })
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border bg-card px-4 py-3 sm:px-5">
      <span className="text-sm text-muted-foreground">{count === 1 ? "1 customer is overdue." : `${count} customers are overdue.`}</span>
      <Button size="sm" disabled={remind.isPending} onClick={() => remind.mutate()}>
        <BellRingIcon /> Remind all
      </Button>
    </div>
  )
}
