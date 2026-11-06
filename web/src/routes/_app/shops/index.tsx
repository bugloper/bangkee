import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { SearchIcon, StoreIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import { Chips } from "@/components/catalog"
import { Loading } from "@/components/form"
import { Empty, Initial, Panel, Row, Rows } from "@/components/kit"
import { ShopCard } from "@/components/shop-view"
import { Input } from "@/components/ui/input"
import { pluralize } from "@/lib/money"
import { usePage } from "@/lib/page"

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

      {data && <Chips label="Type of business" chips={[{ key: "", label: "All" }, ...data.kinds]} value={kind} onChange={setKind} />}

      {!data ? (
        <Loading />
      ) : data.shops.length > 0 ? (
        <>
          {/* A desktop shows the shops as cards, several to a row. */}
          <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3">
            {data.shops.map((shop) => (
              <ShopCard key={shop.id} shop={shop} href={`/shops/${shop.id}`} />
            ))}
          </div>
          <Panel flush className="md:hidden">
            <Rows>
              {data.shops.map((shop) => (
                <Row
                  key={shop.id}
                  href={`/shops/${shop.id}`}
                  leading={<Initial text={shop.name} src={shop.photo_url} />}
                  title={shop.name}
                  subtitle={[shop.kind_label, shop.location].filter(Boolean).join(" · ")}
                  trailing={<span className="text-xs text-muted-foreground">{pluralize(shop.items_count, "item")}</span>}
                  chevron
                />
              ))}
            </Rows>
          </Panel>
        </>
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
