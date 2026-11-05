import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"

import { api } from "@/api/client"
import { Loading } from "@/components/form"
import { Panel } from "@/components/kit"
import { MenuForm } from "@/components/menu-form"
import { Button } from "@/components/ui/button"
import { confirm } from "@/lib/confirm"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"

export const Route = createFileRoute("/_app/menu_items/$id/edit")({ component: EditMenuItem })

function EditMenuItem() {
  const id = Number(Route.useParams().id)
  const { data } = useQuery({ queryKey: ["menu_item", id], queryFn: () => api.menuItem(id) })
  usePage(data ? `Edit ${data.name}` : "Edit", "/menu_items", { narrow: true })
  const remove = useMutation({
    mutationFn: () => api.deleteMenuItem(id),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      go("/menu_items")
    },
  })
  if (!data) return <Loading />

  return (
    <div className="grid gap-5">
      <Panel>
        <MenuForm item={data} />
      </Panel>
      <Panel title="Remove this item" description="Credits already recorded keep their own copy of the name and price.">
        <Button
          variant="destructive"
          disabled={remove.isPending}
          onClick={async () => {
            const ok = await confirm(
              `Remove ${data.name}?|Credits already recorded keep their own copy of the name and price, so nothing in the book changes.`,
              { danger: true },
            )
            if (ok) remove.mutate()
          }}
        >
          <Trash2Icon /> Remove item
        </Button>
      </Panel>
    </div>
  )
}
