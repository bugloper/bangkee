import { PlusIcon, SearchIcon } from "lucide-react"
import { useState } from "react"

import type { LineItemInput, MenuItem } from "@/api/types"
import { Input } from "@/components/ui/input"
import { ngultrum } from "@/lib/money"
import { cn } from "@/lib/utils"

/** Past this many items, a search box helps find one. */
const SEARCH_FROM = 9

/**
 * The shop's items as buttons: one tap puts an item on the purchase being
 * recorded, at its listed price. A second tap on the same item adds one more.
 * An item whose stock is counted says how many are left.
 */
export function ItemChooser({ items, counts, onPick }: { items: MenuItem[]; counts: Record<number, number>; onPick: (item: MenuItem) => void }) {
  const [q, setQ] = useState("")
  const needle = q.trim().toLowerCase()
  const shown = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items

  return (
    <div className="grid gap-2.5">
      {items.length >= SEARCH_FROM && (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Find an item" placeholder="Find an item" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
        {shown.map((item) => {
          const count = counts[item.id] ?? 0
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`Add ${item.name}`}
              className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-sm transition-colors hover:border-primary/40 hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent"
              aria-pressed={count > 0}
              onClick={() => onPick(item)}
            >
              {item.image_url ? (
                <img src={item.image_url} alt="" loading="lazy" className="size-7 rounded-full object-cover" />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full bg-muted text-primary">
                  <PlusIcon className="size-3.5" />
                </span>
              )}
              <span className="font-medium">{item.name}</span>
              <span className="tabular text-muted-foreground">{ngultrum(item.price_cents)}</span>
              {item.stock !== null && (
                <span className={cn("tabular text-xs", item.stock - count <= (item.low_stock_at ?? 0) ? "font-medium text-owed" : "text-muted-foreground")}>
                  {item.stock - count > 0 ? `${item.stock - count} left` : "none left"}
                </span>
              )}
              {count > 0 && <span className="tabular rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">×{count}</span>}
            </button>
          )
        })}
        {shown.length === 0 && <p className="text-sm text-muted-foreground">No item called “{q.trim()}”.</p>}
      </div>
    </div>
  )
}

/** A line's quantity: whole units for an item whose stock is counted. */
export function QuantityInput({ line, whole, onChange }: { line: LineItemInput; whole: boolean; onChange: (value: string) => void }) {
  return (
    <Input
      type="number"
      step={whole ? "1" : "0.01"}
      min={whole ? "1" : undefined}
      inputMode={whole ? "numeric" : "decimal"}
      placeholder="1"
      aria-label="Qty"
      className="tabular"
      value={line.quantity}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
