import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { StoreIcon } from "lucide-react"

import { api } from "@/api/client"
import { Loading } from "@/components/form"
import { Count, Empty, Initial, Panel, Row, Rows } from "@/components/kit"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_admin/shops")({ component: Shops })

const STATUS_BADGE: Record<string, BadgeVariant> = { trialing: "brand", active: "paid", past_due: "warn", disabled: "owed" }

function Shops() {
  usePage("Shops")
  const { data } = useQuery({ queryKey: ["admin", "shops"], queryFn: api.adminShops })
  if (!data) return <Loading />

  return (
    <Panel
      flush
      title={
        <span className="flex items-center gap-2">
          All shops <Count>{data.shops.length}</Count>
        </span>
      }
    >
      {data.shops.length > 0 ? (
        <Rows>
          {data.shops.map((shop) => (
            <Row
              key={shop.id}
              leading={<Initial text={shop.name} />}
              title={shop.name}
              subtitle={`${shop.owner_name} · ${shop.owner_email}`}
              trailing={
                <>
                  <Badge variant={shop.subscription ? (STATUS_BADGE[shop.subscription.status] ?? "muted") : "muted"}>{shop.subscription?.status_label ?? "No subscription"}</Badge>
                  <span className="text-xs text-muted-foreground">{shop.subscription?.summary ?? "No subscription"}</span>
                </>
              }
            />
          ))}
        </Rows>
      ) : (
        <Empty icon={StoreIcon} title="No shops yet" />
      )}
    </Panel>
  )
}
