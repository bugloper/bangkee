import { useMutation, useQuery } from "@tanstack/react-query"
import { ClipboardCheckIcon, PackagePlusIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { MenuItem, StockMovement, StockReason } from "@/api/types"
import { ErrorBox, Field } from "@/components/form"
import { Panel } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { useCan } from "@/lib/me"
import { ngultrum } from "@/lib/money"
import { refreshAll } from "@/lib/query"
import { dayMonth } from "@/lib/time"
import { cn } from "@/lib/utils"

// A counted item's stock: what is on the shelf and what it is worth, adding
// what came in, correcting the count after counting the shelf, and every
// change to it, newest first.

const REASON: Record<StockReason, string> = {
  started: "Started counting",
  restock: "Stock added",
  correction: "Count corrected",
  credit: "Taken on credit",
  sale: "Sold",
  credit_crossed_out: "Credit crossed out",
  sale_crossed_out: "Sale crossed out",
}

export function StockPanel({ item }: { item: MenuItem }) {
  const canManage = useCan("manage")
  const [open, setOpen] = useState<"restock" | "recount" | null>(null)
  const history = useQuery({ queryKey: ["item_stock", item.id], queryFn: () => api.itemStock(item.id) })
  if (item.stock === null) return null
  const value = item.cost_cents !== null && item.stock > 0 ? item.stock * item.cost_cents : null

  return (
    <Panel title="Stock">
      {/* minmax(0,1fr): a long note in the history truncates rather than widening the page. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className={cn("tabular text-3xl font-semibold tracking-tight", item.low && "text-owed")}>{item.stock}</div>
            <div className="text-sm text-muted-foreground">
              {item.sold_out ? "None left: customers see it as out of stock" : item.low ? "Running low" : "On the shelf"}
              {item.low_stock_at !== null && ` · warns at ${item.low_stock_at}`}
            </div>
          </div>
          {value !== null && (
            <div className="text-right">
              <div className="tabular text-lg font-medium">{ngultrum(value)}</div>
              <div className="text-sm text-muted-foreground">at buying price</div>
            </div>
          )}
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant={open === "restock" ? "secondary" : "outline"} onClick={() => setOpen(open === "restock" ? null : "restock")}>
              <PackagePlusIcon /> Add stock
            </Button>
            <Button variant={open === "recount" ? "secondary" : "outline"} onClick={() => setOpen(open === "recount" ? null : "recount")}>
              <ClipboardCheckIcon /> Correct count
            </Button>
          </div>
        )}
        {open === "restock" && <Restock item={item} onDone={() => setOpen(null)} />}
        {open === "recount" && <Recount item={item} onDone={() => setOpen(null)} />}

        {history.data && history.data.history.length > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <div className="text-sm font-medium text-muted-foreground">History</div>
            <ul className="divide-y rounded-xl border">
              {history.data.history.map((move) => (
                <Move key={move.id} move={move} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  )
}

function Move({ move }: { move: StockMovement }) {
  const detail = [move.by, move.unit_cost_cents !== null && move.reason === "restock" ? `${ngultrum(move.unit_cost_cents)} each` : null, move.notes].filter(Boolean).join(" · ")
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{REASON[move.reason]}</div>
        <div className="truncate text-xs text-muted-foreground">
          {dayMonth(move.at)} · {detail}
        </div>
      </div>
      <div className="text-right">
        <div className={cn("tabular text-sm font-semibold", move.change > 0 ? "text-paid" : move.change < 0 ? "text-owed" : "")}>
          {move.reason === "started" ? move.change : move.change > 0 ? `+${move.change}` : move.change}
        </div>
        <div className="tabular text-xs text-muted-foreground">{move.stock_after} left</div>
      </div>
    </li>
  )
}

function Restock({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const [quantity, setQuantity] = useState("")
  const [cost, setCost] = useState(item.cost ?? "")
  const [notes, setNotes] = useState("")
  const save = useMutation({
    mutationFn: () => api.restockItem(item.id, { quantity, cost, notes }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      onDone()
    },
  })
  return (
    <form
      className="grid gap-3 rounded-xl border bg-muted/30 p-3.5"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <ErrorBox errors={validationErrors(save.error)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="How many came in" htmlFor="restock_quantity">
          <Input id="restock_quantity" required autoFocus inputMode="numeric" placeholder="e.g. 20" className="tabular" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Buying price (Nu.)" htmlFor="restock_cost">
          <Input id="restock_cost" inputMode="decimal" placeholder="Optional" className="tabular" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
      </div>
      <Field label="Note" hint="Optional — the supplier, a bill number" htmlFor="restock_notes">
        <Input id="restock_notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" disabled={save.isPending} className="justify-self-start">
        Add stock
      </Button>
    </form>
  )
}

function Recount({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const [counted, setCounted] = useState("")
  const [notes, setNotes] = useState("")
  const save = useMutation({
    mutationFn: () => api.recountItem(item.id, { counted, notes }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      onDone()
    },
  })
  return (
    <form
      className="grid gap-3 rounded-xl border bg-muted/30 p-3.5"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <ErrorBox errors={validationErrors(save.error)} />
      <Field label="How many are on the shelf" hint={`The count says ${item.stock}`} htmlFor="recount_counted">
        <Input id="recount_counted" required autoFocus inputMode="numeric" className="tabular" value={counted} onChange={(e) => setCounted(e.target.value)} />
      </Field>
      <Field label="Note" hint="Optional — why it was off, such as damaged or given away" htmlFor="recount_notes">
        <Input id="recount_notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" disabled={save.isPending} className="justify-self-start">
        Correct count
      </Button>
    </form>
  )
}
