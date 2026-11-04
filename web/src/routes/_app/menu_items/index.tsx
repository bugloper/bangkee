import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ImageIcon, InfoIcon, NotebookTextIcon } from "lucide-react"

import { api } from "@/api/client"
import { Empty, Money, Note, Panel, Row, Rows } from "@/components/kit"
import { MenuForm } from "@/components/menu-form"
import { Badge } from "@/components/ui/badge"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_app/menu_items/")({ component: Menu })

// What the shop sells, with prices: picked from when recording a credit, and
// what customers see when they browse the shop.
function Menu() {
  usePage("Items", undefined, { narrow: true })
  const { data } = useQuery({ queryKey: ["menu_items"], queryFn: api.menuItems })
  if (!data) return null

  return (
    <div className="grid gap-5">
      <Note icon={InfoIcon}>
        Pick from your items when you record a credit, instead of typing each one. Customers see them, with prices, when they browse shops. Items you mark <b className="font-semibold">not available today</b> are hidden from both.
      </Note>

      {data.items.length > 0 ? (
        <Panel flush>
          <Rows>
            {data.items.map((item) => (
              <Row
                key={item.id}
                href={`/menu_items/${item.id}/edit`}
                dimmed={!item.available}
                leading={
                  item.image_url ? (
                    <img src={item.image_url} alt="" loading="lazy" className="size-11 rounded-lg object-cover" />
                  ) : (
                    <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <ImageIcon className="size-4" />
                    </span>
                  )
                }
                title={
                  <span className="flex items-center gap-1.5">
                    {item.name}
                    {!item.available && <Badge variant="muted">Off today</Badge>}
                  </span>
                }
                subtitle={item.category || "Ungrouped"}
                trailing={<Money cents={item.price_cents} />}
                chevron
              />
            ))}
          </Rows>
        </Panel>
      ) : (
        <Panel>
          <Empty icon={NotebookTextIcon} title="No items yet">
            Add what you sell and its price. Then a customer's purchase is a few taps when you record a credit.
          </Empty>
        </Panel>
      )}

      <Panel title="Add an item">
        <MenuForm />
      </Panel>
    </div>
  )
}
