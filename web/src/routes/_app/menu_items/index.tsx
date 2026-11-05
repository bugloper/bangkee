import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { EyeIcon, NotebookTextIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { MenuItem } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { Chips, ItemThumb } from "@/components/catalog"
import { Loading } from "@/components/form"
import { Empty, Panel, SectionLabel } from "@/components/kit"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { groupByCategory, matches } from "@/lib/catalog"
import { flashNotice } from "@/lib/flash"
import { useMe } from "@/lib/me"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/menu_items/")({ component: Catalog })

const ALL = ""
const OUT = "\u0000out" // the "Out of stock" chip; no category can be named this

// The shop's catalog: what it sells, by category, with prices and whether it
// is in stock. Picked from when recording a credit; customers browse it.
function Catalog() {
  usePage("Items", "/settings", { narrow: true })
  const me = useMe()
  const { data } = useQuery({ queryKey: ["menu_items"], queryFn: api.menuItems })
  const [q, setQ] = useState("")
  const [chip, setChip] = useState(ALL)
  if (!data) return <Loading />

  const items = data.items
  const groups = groupByCategory(items)
  const outCount = items.filter((item) => !item.available).length
  const chips = [
    { key: ALL, label: "All", count: items.length },
    ...groups.map((g) => ({ key: g.category, label: g.category, count: g.items.length })),
    ...(outCount > 0 ? [{ key: OUT, label: "Out of stock", count: outCount }] : []),
  ]
  const shown = groups
    .filter((g) => chip === ALL || chip === OUT || g.category === chip)
    .map((g) => ({ ...g, items: g.items.filter((item) => (chip !== OUT || !item.available) && matches(q, item.name, item.category)) }))
    .filter((g) => g.items.length > 0)
  const category = chip !== ALL && chip !== OUT ? chip : undefined
  const addHref = category ? `/menu_items/new?category=${encodeURIComponent(category)}` : "/menu_items/new"

  if (items.length === 0) {
    return (
      <Panel>
        <Empty
          icon={NotebookTextIcon}
          title="No items yet"
          action={
            <AppLink href="/menu_items/new" className={buttonVariants()}>
              <PlusIcon /> Add your first item
            </AppLink>
          }
        >
          Add what you sell, its price and a category. Recording a credit becomes a few taps, and customers can see your prices.
        </Empty>
      </Panel>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search items" placeholder="Search items" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <AppLink href={addHref} className={buttonVariants()}>
          <PlusIcon /> Add
        </AppLink>
      </div>

      {groups.length > 1 || outCount > 0 ? <Chips label="Category" chips={chips} value={chip} onChange={setChip} /> : null}

      {shown.length > 0 ? (
        shown.map((group) => (
          <section key={group.category} className="grid gap-2">
            <SectionLabel>
              {group.category} · {group.items.length}
            </SectionLabel>
            <Panel flush>
              <div className="divide-y">
                {group.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            </Panel>
          </section>
        ))
      ) : (
        <Panel>
          <Empty icon={SearchIcon} title="Nothing matches">
            {q.trim() ? `No item called “${q.trim()}”${category ? ` in ${category}` : ""}.` : "No items here."}
          </Empty>
        </Panel>
      )}

      {me?.shop && (
        <AppLink href={`/shops/${me.shop.id}`} className="inline-flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-primary hover:underline">
          <EyeIcon className="size-4" /> See your shop as customers do
        </AppLink>
      )}
    </div>
  )
}

/** One item: tap it to edit; the switch says whether it is in stock. */
function ItemRow({ item }: { item: MenuItem }) {
  const stock = useMutation({
    mutationFn: (available: boolean) => api.updateMenuItem(item.id, { name: item.name, category: item.category ?? "", price: item.price, available, position: item.position }),
    onSuccess: async (_, available) => {
      flashNotice(available ? `${item.name} is in stock.` : `${item.name} is out of stock.`)
      await refreshAll()
    },
  })
  const available = stock.isPending ? stock.variables : item.available

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <AppLink href={`/menu_items/${item.id}/edit`} className="flex min-w-0 flex-1 items-center gap-3">
        <ItemThumb src={item.image_url} className={cn("size-12", !available && "opacity-50 grayscale")} />
        <span className={cn("min-w-0 flex-1", !available && "opacity-60")}>
          <span className="block truncate text-sm font-medium">{item.name}</span>
          <span className="tabular block text-[0.8125rem] text-muted-foreground">
            {ngultrum(item.price_cents)}
            {!available && " · Out of stock"}
          </span>
        </span>
      </AppLink>
      <label className="flex shrink-0 flex-col items-center gap-1 text-[0.6875rem] text-muted-foreground">
        <Switch checked={available} disabled={stock.isPending} onCheckedChange={(checked) => stock.mutate(checked)} aria-label={`${item.name} in stock`} />
        In stock
      </label>
    </div>
  )
}
