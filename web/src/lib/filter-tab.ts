import { cn } from "@/lib/utils"

/** One filter in a FilterTabs strip — a router Link takes these classes. */
export function filterTab(active: boolean) {
  return cn(
    "flex-1 shrink-0 rounded-full px-4 py-2 text-center text-sm font-medium whitespace-nowrap transition-colors sm:flex-none",
    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
  )
}
