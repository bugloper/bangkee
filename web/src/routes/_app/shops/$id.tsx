import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { api } from "@/api/client"
import { Loading } from "@/components/form"
import { Panel } from "@/components/kit"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_app/shops/$id")({ component: ShopScreen })

// A shop's items and prices, as its customers read them. Buying happens at
// the counter; this is for knowing what is there and what it costs.
function ShopScreen() {
  const id = Number(Route.useParams().id)
  const { data } = useQuery({ queryKey: ["shop", id], queryFn: () => api.shopPage(id) })
  usePage(data?.shop.name, "/shops", { narrow: true })
  if (!data) return <Loading />

  return (
    <div className="grid gap-4">
      <div className="text-sm text-muted-foreground">{data.shop.kind_label}</div>
      {data.menu.map((group) => (
        <Panel key={group.category} flush title={group.category}>
          <div className="divide-y">
            {group.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                {item.image_url && <img src={item.image_url} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />}
                <div className="min-w-0 flex-1 text-sm font-medium">{item.name}</div>
                <div className="tabular shrink-0 text-sm font-semibold">{ngultrum(item.price_cents)}</div>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  )
}
