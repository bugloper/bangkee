import { createFileRoute } from "@tanstack/react-router"

import { Panel } from "@/components/kit"
import { MenuForm } from "@/components/menu-form"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_app/menu_items/new")({
  validateSearch: (search: Record<string, unknown>): { category?: string } => ({ category: typeof search.category === "string" ? search.category : undefined }),
  component: NewMenuItem,
})

// Adding items, one after another: the form stays, keeping the category, so a
// whole shelf goes in without leaving the screen.
function NewMenuItem() {
  usePage("Add item", "/menu_items", { narrow: true })
  const { category } = Route.useSearch()
  return (
    <Panel>
      <MenuForm defaultCategory={category} />
    </Panel>
  )
}
