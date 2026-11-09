import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ArrowDownLeftIcon, PackagePlusIcon, PrinterIcon, ScrollTextIcon, StrikethroughIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { SupplierEntry } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { ChoiceField } from "@/components/choice-field"
import { DateTimeField } from "@/components/date-time-field"
import { ErrorBox, Field, FormActions, Loading } from "@/components/form"
import { Empty, Initial, Money, Panel } from "@/components/kit"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { confirm } from "@/lib/confirm"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { useCan, useFeature } from "@/lib/me"
import { ngultrum } from "@/lib/money"
import { newKey } from "@/lib/offline-queue"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { dateTime, fromDatetimeLocal } from "@/lib/time"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/suppliers/$id/")({ component: SupplierScreen })

function SupplierScreen() {
  const id = Number(Route.useParams().id)
  const { data } = useQuery({ queryKey: ["supplier", id], queryFn: () => api.supplier(id) })
  usePage(data?.supplier.name ?? "Supplier", "/suppliers")
  const planAllows = useFeature("suppliers")
  const canManage = useCan("manage")
  const allowed = planAllows && canManage
  const [form, setForm] = useState<"purchases" | "payments" | null>(null)
  const remove = useMutation({
    mutationFn: () => api.deleteSupplier(id),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      go("/suppliers", { replace: true })
    },
  })
  if (!data) return <Loading />
  const { supplier, ledger } = data
  const big = "h-13 rounded-xl text-[0.9375rem] font-semibold"

  return (
    <div className="grid gap-6">
      <Panel>
        <div className="flex items-center gap-3">
          <Initial text={supplier.name} size="lg" tone="muted" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold tracking-tight">{supplier.name}</div>
            <div className="text-sm text-muted-foreground">
              {supplier.phone || "No phone"}
              {supplier.notes && ` · ${supplier.notes}`}
            </div>
          </div>
          <AppLink href={`/suppliers/${id}/statement`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <PrinterIcon /> <span className="max-sm:sr-only">Statement</span>
          </AppLink>
        </div>
        <div className="mt-6">
          <div className="text-sm text-muted-foreground">{supplier.balance_cents > 0 ? "You owe them" : supplier.balance_cents < 0 ? "Paid ahead" : "Settled — you owe nothing"}</div>
          <Money cents={supplier.balance_cents} tone={supplier.balance_cents > 0 ? "owed" : "neutral"} className="mt-1 text-4xl font-semibold tracking-tight" />
        </div>
        {allowed && (
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Button variant="credit" className={big} onClick={() => setForm("purchases")}>
              <PackagePlusIcon /> Bought on credit
            </Button>
            <Button variant="payment" className={big} onClick={() => setForm("payments")}>
              <ArrowDownLeftIcon /> Paid them
            </Button>
          </div>
        )}
        {form && <EntryForm supplierId={id} kind={form} onDone={() => setForm(null)} />}
      </Panel>

      <Panel flush title="History">
        {ledger.length > 0 ? (
          <div className="divide-y">
            {ledger.map((entry) => (
              <SupplierRow key={entry.id} entry={entry} editable={allowed} />
            ))}
          </div>
        ) : (
          <Empty icon={ScrollTextIcon} title="Nothing recorded yet">
            Record what you buy on credit, and what you pay.
          </Empty>
        )}
      </Panel>

      {supplier.balance_cents === 0 && allowed && (
        <div>
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={remove.isPending}
            onClick={async () => {
              if (await confirm(`Remove ${supplier.name}?|Their history goes with them.`, { danger: true })) remove.mutate()
            }}
          >
            <Trash2Icon /> Remove supplier
          </Button>
        </div>
      )}
    </div>
  )
}

function EntryForm({ supplierId, kind, onDone }: { supplierId: number; kind: "purchases" | "payments"; onDone: () => void }) {
  const purchase = kind === "purchases"
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [method, setMethod] = useState("")
  const [when, setWhen] = useState("")
  // One key per form: a double tap, or a retry after a dropped connection, records it once.
  const [key] = useState(newKey)
  const record = useMutation({
    mutationFn: () => api.recordSupplierEntry(supplierId, kind, { amount, description, payment_method: method, occurred_at: fromDatetimeLocal(when), idempotency_key: key }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      onDone()
    },
  })
  return (
    <form
      className="mt-6 grid gap-4 border-t pt-5"
      onSubmit={(event) => {
        event.preventDefault()
        record.mutate()
      }}
    >
      <h3 className="font-semibold">{purchase ? "Bought on credit" : "Paid the supplier"}</h3>
      <ErrorBox errors={validationErrors(record.error)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (Nu.)" htmlFor="amount">
          <Input id="amount" inputMode="decimal" required autoFocus className="tabular" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="When" htmlFor="when">
          <DateTimeField id="when" value={when} onChange={setWhen} />
        </Field>
      </div>
      {purchase ? (
        <Field label="What" hint="Optional" htmlFor="description">
          <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Rice, 20 bags" />
        </Field>
      ) : (
        <Field label="How you paid" hint="Optional" htmlFor="method">
          <ChoiceField id="method" title="How you paid" value={method} onChange={setMethod} groups={[{ choices: ["Cash", "mBoB", "Bank transfer"].map((m) => ({ value: m, label: m })) }]} />
        </Field>
      )}
      <FormActions>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={record.isPending}>
          Record
        </Button>
      </FormActions>
    </form>
  )
}

function SupplierRow({ entry, editable }: { entry: SupplierEntry; editable: boolean }) {
  const crossOut = useMutation({
    mutationFn: () => api.crossOutSupplierEntry(entry.id),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })
  const purchase = entry.kind === "purchase"
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium", entry.crossed_out && "text-muted-foreground line-through")}>{entry.description || (purchase ? "Bought on credit" : "Payment")}</div>
        <div className="text-[0.8125rem] text-muted-foreground">
          {entry.crossed_out && "Crossed out · "}
          {dateTime(entry.occurred_at)} · by {entry.created_by_name}
          {entry.payment_method && ` · ${entry.payment_method}`}
        </div>
        {editable && !entry.crossed_out && (
          <button
            type="button"
            disabled={crossOut.isPending}
            onClick={async () => {
              if (await confirm(`Cross out this ${entry.kind}?|It stays in the history with a line through it, and no longer counts.`, { danger: true })) crossOut.mutate()
            }}
            className={cn(buttonVariants({ variant: "destructive", size: "sm" }), "mt-2")}
          >
            <StrikethroughIcon /> Cross out
          </button>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("tabular text-[0.9375rem] font-semibold", entry.crossed_out ? "text-muted-foreground line-through" : purchase ? "text-owed" : "text-paid")}>
          {ngultrum(entry.signed_amount_cents, true)}
        </div>
        {!entry.crossed_out && <div className="tabular mt-0.5 text-xs text-muted-foreground">Owe {ngultrum(entry.running_balance_cents)}</div>}
      </div>
    </div>
  )
}
