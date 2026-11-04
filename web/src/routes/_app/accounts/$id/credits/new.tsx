import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PlusIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { LineItemInput, MenuItem, RecordedEntry } from "@/api/types"
import { AmountField } from "@/components/amount"
import { AppLink } from "@/components/app-link"
import { ErrorBox, Field, FormActions, Loading } from "@/components/form"
import { DateTimeField } from "@/components/date-time-field"
import { ItemChooser } from "@/components/item-chooser"
import { Panel } from "@/components/kit"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { majorAmount } from "@/lib/money"
import { usePage } from "@/lib/page"
import { offerNotifications } from "@/lib/pwa"
import { refreshAll } from "@/lib/query"
import { fromDatetimeLocal } from "@/lib/time"
import { writeOrQueue } from "@/lib/write"

type Search = { mode?: string }

export const Route = createFileRoute("/_app/accounts/$id/credits/new")({
  validateSearch: (search: Record<string, unknown>): Search => ({ mode: search.mode === "itemized" ? "itemized" : undefined }),
  component: NewCredit,
})

const blankLine = (): LineItemInput & { key: number } => ({ key: Math.random(), name: "", quantity: "1", unit_price: "" })

// Recording a credit: goods taken on tick. Simple by default — the total —
// or itemized, picked from the shop's items or typed in, when the owner
// wants the shopping list on the record.
function NewCredit() {
  const id = Number(Route.useParams().id)
  const itemized = Route.useSearch().mode === "itemized"
  usePage(itemized ? "Itemized purchase" : "Add credit", `/accounts/${id}`, { narrow: true })
  const account = useQuery({ queryKey: ["account", id], queryFn: () => api.account(id) })
  const menu = useQuery({ queryKey: ["menu_items"], queryFn: api.menuItems })
  const items = (menu.data?.items ?? []).filter((item) => item.available)

  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [occurredAt, setOccurredAt] = useState("")
  const [lines, setLines] = useState([blankLine()])

  const updateLine = (key: number, field: keyof LineItemInput, value: string) =>
    setLines(lines.map((line) => (line.key === key ? { ...line, [field]: value } : line)))

  // A picked item is a line at its listed price; picking it again adds one
  // more. The empty line the form starts with makes way for it.
  const pick = (item: MenuItem) => {
    const existing = lines.find((line) => line.name === item.name && line.unit_price === item.price)
    if (existing) {
      updateLine(existing.key, "quantity", String((parseFloat(existing.quantity) || 0) + 1))
      return
    }
    const kept = lines.filter((line) => line.name || line.unit_price)
    setLines([...kept, { key: Math.random(), name: item.name, quantity: "1", unit_price: item.price }])
  }
  const picked: Record<string, number> = {}
  for (const line of lines) {
    if (items.some((item) => item.name === line.name && item.price === line.unit_price)) picked[line.name] = parseFloat(line.quantity) || 0
  }

  // The line items are the amount (BR-12), so there is no amount field to get wrong.
  const total = lines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0), 0)

  const save = useMutation({
    mutationFn: () =>
      writeOrQueue<RecordedEntry>({
        url: `/api/accounts/${id}/credits`,
        body: {
          itemized,
          amount: itemized ? undefined : amount,
          description: itemized ? undefined : description,
          occurred_at: fromDatetimeLocal(occurredAt),
          line_items: itemized ? lines.map(({ name, quantity, unit_price }) => ({ name, quantity, unit_price })) : undefined,
        },
        queueKey: `account:${id}`,
        label: "credit",
        amount: itemized ? String(total) : amount,
        description: itemized ? `${lines.filter((line) => line.name).length} items` : description,
        dated: true,
      }),
    onSuccess: async (result) => {
      if (result) {
        flashNotice(result.notice)
        await refreshAll()
        if (!result.duplicate) offerNotifications()
      }
      go(`/accounts/${id}`, { replace: true })
    },
  })

  if (!account.data) return <Loading />
  const name = account.data.account.display_name

  return (
    <Panel>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <ErrorBox errors={validationErrors(save.error)} />

        {itemized ? (
          <div>
            {items.length > 0 && (
              <div className="mb-5">
                <div className="mb-2 text-sm font-medium text-muted-foreground">Tap what {name} took</div>
                <ItemChooser items={items} counts={picked} onPick={pick} />
              </div>
            )}
            <div className="text-sm font-medium text-muted-foreground">Items taken by {name}</div>
            <div className="mt-2 grid grid-cols-[1fr_4.5rem_6rem_2.25rem] gap-2 text-xs font-medium text-muted-foreground max-sm:hidden">
              <span>Item</span>
              <span>Qty</span>
              <span>Price</span>
            </div>
            <div className="mt-1.5 grid gap-2">
              {lines.map((line) => (
                <div key={line.key} className="grid grid-cols-[1fr_4.5rem_6rem_2.25rem] items-center gap-2">
                  <Input placeholder="Rice 25 kg" aria-label="Item" value={line.name} onChange={(e) => updateLine(line.key, "name", e.target.value)} />
                  <Input type="number" step="0.01" inputMode="decimal" placeholder="1" aria-label="Qty" className="tabular" value={line.quantity} onChange={(e) => updateLine(line.key, "quantity", e.target.value)} />
                  <Input inputMode="decimal" placeholder="Nu." aria-label="Price" className="tabular" value={line.unit_price} onChange={(e) => updateLine(line.key, "unit_price", e.target.value)} />
                  <Button variant="ghost" size="icon" aria-label="Remove item" className="text-muted-foreground" onClick={() => setLines(lines.filter((other) => other.key !== line.key))}>
                    <XIcon />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-3 border-dashed" onClick={() => setLines([...lines, blankLine()])}>
              <PlusIcon /> Add another item
            </Button>
            <div className="mt-4 flex items-baseline justify-between border-t pt-4">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="tabular text-2xl font-semibold tracking-tight text-owed">{majorAmount(total)}</span>
            </div>
          </div>
        ) : (
          <>
            <AmountField label={`Amount given on credit to ${name}`} tone="credit" value={amount} onChange={setAmount} autoFocus />
            <Field label="What was taken" hint="Optional" htmlFor="description">
              <Input id="description" placeholder="e.g. Groceries, rice, oil" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            {items.length > 0 && (
              <AppLink href={`/accounts/${id}/credits/new?mode=itemized`} className="justify-self-start text-sm font-medium text-primary hover:underline">
                Pick from your items instead
              </AppLink>
            )}
          </>
        )}

        <Field label="When" htmlFor="occurred_at">
          <DateTimeField id="occurred_at" value={occurredAt} onChange={setOccurredAt} />
        </Field>

        <FormActions>
          <AppLink href={`/accounts/${id}`} className={buttonVariants({ variant: "ghost", size: "xl" })}>
            Cancel
          </AppLink>
          <Button type="submit" variant="credit" size="xl" disabled={save.isPending}>
            Save credit
          </Button>
        </FormActions>
      </form>
    </Panel>
  )
}
