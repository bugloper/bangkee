import { cn } from "@/lib/utils"

/** One filter in a FilterTabs strip — a router Link takes these classes. */
export function filterTab(active: boolean) {
  return cn(
    "flex-1 shrink-0 rounded-lg px-3 py-1.5 text-center text-sm font-medium whitespace-nowrap transition-colors sm:flex-none",
    active ? "bg-card text-foreground shadow-xs ring-1 ring-foreground/5" : "text-muted-foreground hover:text-foreground",
  )
}
