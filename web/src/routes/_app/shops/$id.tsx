import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { api } from "@/api/client"
import { Loading } from "@/components/form"
import { ShopHeader, ShopMenu } from "@/components/shop-view"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_app/shops/$id")({ component: ShopScreen })

// A shop as its customers see it: who they are, where, when they are open,
// and what they sell at what price — and what is out of stock. Buying
// happens at the counter; this is for knowing before you go.
function ShopScreen() {
  const id = Number(Route.useParams().id)
  const { data } = useQuery({ queryKey: ["shop", id], queryFn: () => api.shopPage(id) })
  usePage(data?.shop.name, data?.mine ? "/menu_items" : "/shops")
  if (!data) return <Loading />

  // A desktop keeps who the shop is in view beside what it sells.
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4 xl:max-w-none xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start xl:gap-6">
      <div className="xl:sticky xl:top-24">
        <ShopHeader shop={data.shop} mine={data.mine} />
      </div>
      <ShopMenu data={data} />
    </div>
  )
}
