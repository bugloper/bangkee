import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { SearchIcon, StoreIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import { Loading } from "@/components/form"
import { Empty, Initial, Panel, Row, Rows } from "@/components/kit"
import { Input } from "@/components/ui/input"
import { pluralize } from "@/lib/money"
import { usePage } from "@/lib/page"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/shops/")({ component: Shops })

// The shops on Bangkee, for customers: find one by type or by name and see
// what it sells, at what price.
function Shops() {
  usePage("Shops")
  const [kind, setKind] = useState("")
  const [q, setQ] = useState("")
  const { data } = useQuery({ queryKey: ["shops", kind, q], queryFn: () => api.shopDirectory(kind, q.trim()), placeholderData: keepPreviousData })

  return (
    <div className="grid gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Search shops" placeholder="Search shops" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {data && (
        <div role="radiogroup" aria-label="Type of business" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ key: "", label: "All" }, ...data.kinds].map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              onClick={() => setKind(k.key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                kind === k.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <Loading />
      ) : data.shops.length > 0 ? (
        <Panel flush>
          <Rows>
            {data.shops.map((shop) => (
              <Row
                key={shop.id}
                href={`/shops/${shop.id}`}
                leading={<Initial text={shop.name} />}
                title={shop.name}
                subtitle={`${shop.kind_label} · ${pluralize(shop.items_count, "item")}`}
                chevron
              />
            ))}
          </Rows>
        </Panel>
      ) : (
        <Panel>
          <Empty icon={StoreIcon} title="No shops found">
            {q || kind ? "Try another name or type." : "No shop on Bangkee has listed its items yet."}
          </Empty>
        </Panel>
      )}
    </div>
  )
}
