import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PlusIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import { PAYMENT_METHODS, type LineItemInput, type MenuItem, type Notice } from "@/api/types"
import { AmountField } from "@/components/amount"
import { ChoiceField } from "@/components/choice-field"
import { DateTimeField } from "@/components/date-time-field"
import { ErrorBox, Field, FormActions, Segmented } from "@/components/form"
import { ItemChooser } from "@/components/item-chooser"
import { Panel } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { majorAmount } from "@/lib/money"
import { newKey } from "@/lib/offline-queue"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { fromDatetimeLocal } from "@/lib/time"
import { writeOrQueue } from "@/lib/write"

export const Route = createFileRoute("/_app/sales/new")({ component: NewSale })

const blankLine = (): LineItemInput & { key: number } => ({ key: Math.random(), name: "", quantity: "1", unit_price: "" })
const MODES = ["Amount", "Pick items"] as const

// A sale paid on the spot. Fast at the counter: the total and how it was
// paid, or the items picked from the shop's list. Naming the customer is
// optional and only for the shop's own record — it never touches their book.
// After saving the form is ready for the next sale.
function NewSale() {
  usePage("New sale", "/sales", { narrow: true })
  const menu = useQuery({ queryKey: ["menu_items"], queryFn: api.menuItems })
  const items = (menu.data?.items ?? []).filter((item) => item.available)
  const customers = useQuery({ queryKey: ["accounts", "", ""], queryFn: () => api.accounts({}) })

  const [mode, setMode] = useState<(typeof MODES)[number]>("Amount")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>(PAYMENT_METHODS[0])
  const [customer, setCustomer] = useState("")
  const [occurredAt, setOccurredAt] = useState("")
  const [lines, setLines] = useState([blankLine()])
  // One key per sale: a double tap, or a retry after a dropped connection, records it once.
  const [key, setKey] = useState(newKey)
  const itemized = mode === "Pick items"

  const updateLine = (lineKey: number, field: keyof LineItemInput, value: string) => setLines(lines.map((line) => (line.key === lineKey ? { ...line, [field]: value } : line)))
  const pick = (item: MenuItem) => {
    const existing = lines.find((line) => line.name === item.name && line.unit_price === item.price)
    if (existing) return updateLine(existing.key, "quantity", String((parseFloat(existing.quantity) || 0) + 1))
    setLines([...lines.filter((line) => line.name || line.unit_price), { key: Math.random(), name: item.name, quantity: "1", unit_price: item.price }])
  }
  const picked: Record<string, number> = {}
  for (const line of lines) if (items.some((item) => item.name === line.name && item.price === line.unit_price)) picked[line.name] = parseFloat(line.quantity) || 0
  const total = lines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0), 0)

  const reset = () => {
    setAmount("")
    setDescription("")
    setCustomer("")
    setOccurredAt("")
    setLines([blankLine()])
    setKey(newKey())
  }

  const save = useMutation({
    mutationFn: () =>
      writeOrQueue<Notice & { duplicate: boolean }>({
        url: "/api/sales",
        body: {
          amount: itemized ? undefined : amount,
          itemized,
          line_items: itemized ? lines.map(({ name, quantity, unit_price }) => ({ name, quantity, unit_price })) : undefined,
          description: itemized ? undefined : description,
          payment_method: method,
          account_id: customer ? Number(customer) : undefined,
          occurred_at: fromDatetimeLocal(occurredAt),
          idempotency_key: key,
        },
        queueKey: "sales",
        label: "sale",
        amount: itemized ? String(total) : amount,
        description: itemized ? `${lines.filter((line) => line.name).length} items · ${method}` : [description, method].filter(Boolean).join(" · "),
        dated: true,
      }),
    onSuccess: async (result) => {
      if (result) {
        flashNotice(result.notice)
        await refreshAll()
      }
      reset()
    },
  })

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
        {items.length > 0 && <Segmented label="Record by" name="mode" options={MODES} value={mode} onChange={setMode} />}

        {itemized ? (
          <div>
            <div className="mb-2 text-sm font-medium text-muted-foreground">Tap what was sold</div>
            <ItemChooser items={items} counts={picked} onPick={pick} />
            <div className="mt-5 grid gap-2">
              {lines.map((line) => (
                <div key={line.key} className="grid grid-cols-[1fr_4.5rem_6rem_2.25rem] items-center gap-2">
                  <Input placeholder="Item" aria-label="Item" value={line.name} onChange={(e) => updateLine(line.key, "name", e.target.value)} />
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="1"
                    aria-label="Qty"
                    className="tabular"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, "quantity", e.target.value)}
                  />
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
              <span className="tabular text-2xl font-semibold tracking-tight text-paid">{majorAmount(total)}</span>
            </div>
          </div>
        ) : (
          <>
            <AmountField label="Amount received" tone="payment" value={amount} onChange={setAmount} autoFocus />
            <Field label="What was sold" hint="Optional" htmlFor="description">
              <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Biscuits, soft drinks" />
            </Field>
          </>
        )}

        <Field label="How did they pay?">
          <Segmented label="How did they pay?" name="payment_method" options={PAYMENT_METHODS} value={method} onChange={setMethod} />
        </Field>

        <Field label="Customer" hint="Optional — for your record; it does not touch their book" htmlFor="customer">
          <ChoiceField
            id="customer"
            title="Customer"
            value={customer}
            onChange={setCustomer}
            none="No one in particular"
            placeholder="No one in particular"
            groups={[{ choices: (customers.data?.accounts ?? []).map((a) => ({ value: String(a.id), label: a.display_name })) }]}
          />
        </Field>

        <Field label="When">
          <DateTimeField value={occurredAt} onChange={setOccurredAt} />
        </Field>

        <FormActions>
          <Button type="button" variant="ghost" onClick={() => go("/sales")}>
            Done
          </Button>
          <Button type="submit" variant="payment" size="xl" disabled={save.isPending}>
            Save sale
          </Button>
        </FormActions>
      </form>
    </Panel>
  )
}
