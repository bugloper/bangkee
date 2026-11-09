import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, StoreIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { AdminShops } from "@/api/types"
import { Loading } from "@/components/form"
import { Empty, Initial } from "@/components/kit"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePage } from "@/lib/page"
import { longDate } from "@/lib/time"

export const Route = createFileRoute("/_admin/all_shops")({ component: Shops })

type Shop = AdminShops["shops"][number]

const STATUS_BADGE: Record<string, BadgeVariant> = { trialing: "brand", active: "paid", past_due: "warn", disabled: "owed" }

const FILTERS: [string, string, (shop: Shop) => boolean][] = [
  ["all", "All", () => true],
  ["trialing", "Trial", (shop) => shop.subscription?.status === "trialing"],
  ["paying", "Paying", (shop) => shop.subscription?.status === "active"],
  ["due", "Payment due", (shop) => shop.subscription?.status === "past_due"],
  ["locked", "Locked", (shop) => shop.subscription?.status === "disabled"],
]

const PAGE_SIZE = 20

// Every shop on Bangkee: who owns it, how many customers it keeps, its plan
// and where its subscription stands. Search and filters run on the list
// already loaded.
function Shops() {
  usePage("Shops")
  const { data } = useQuery({ queryKey: ["admin", "shops"], queryFn: api.adminShops })
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  if (!data) return <Loading />

  const q = query.trim().toLowerCase()
  const test = FILTERS.find(([key]) => key === filter)?.[2] ?? (() => true)
  const shown = data.shops.filter((shop) => test(shop) && (!q || [shop.name, shop.owner_name, shop.owner_email].some((text) => text.toLowerCase().includes(q))))
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const rows = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Which shops" className="inline-flex flex-wrap rounded-lg bg-muted p-[3px]">
          {FILTERS.map(([key, label, match]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => {
                setFilter(key)
                setPage(0)
              }}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-xs"
            >
              {label}
              <span className="tabular text-xs text-muted-foreground">{data.shops.filter(match).length}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search shops"
            placeholder="Search shop or owner"
            className="h-9 pl-8"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
          />
        </div>
      </div>

      <Card className="py-0 shadow-xs">
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shop</TableHead>
                <TableHead className="max-lg:hidden">Owner</TableHead>
                <TableHead className="text-right max-sm:hidden">Customers</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="max-md:hidden">Status</TableHead>
                <TableHead className="text-right max-md:hidden">Paid through</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((shop) => (
                <TableRow key={shop.id}>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <Initial text={shop.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{shop.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{shop.kind_label}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="max-lg:hidden">
                    <span className="block">{shop.owner_name}</span>
                    <span className="block text-xs text-muted-foreground">{shop.owner_email}</span>
                  </TableCell>
                  <TableCell className="tabular text-right max-sm:hidden">{shop.customers}</TableCell>
                  <TableCell>{shop.subscription ? <Badge variant="outline">{shop.subscription.status === "trialing" ? "Trial" : shop.subscription.plan_name}</Badge> : "—"}</TableCell>
                  <TableCell className="max-md:hidden">
                    {shop.subscription ? <Badge variant={STATUS_BADGE[shop.subscription.status] ?? "muted"}>{shop.subscription.status_label}</Badge> : "No subscription"}
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground max-md:hidden">{shop.subscription ? longDate(shop.subscription.current_period_end) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty icon={StoreIcon} title={data.shops.length === 0 ? "No shops yet" : "No shop matches"}>
            {data.shops.length > 0 && "Try another name, or another filter."}
          </Empty>
        )}
      </Card>

      {shown.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {current * PAGE_SIZE + 1}–{Math.min(shown.length, (current + 1) * PAGE_SIZE)} of {shown.length}
          </span>
          <div className="flex items-center gap-2">
            <span>
              Page {current + 1} of {pages}
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
