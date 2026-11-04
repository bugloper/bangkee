import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ReceiptTextIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { Billing } from "@/api/types"
import { ErrorBox, Field, FormActions, Loading } from "@/components/form"
import { Empty, KV, Panel, Row, Rows } from "@/components/kit"
import { ScreenshotInput } from "@/components/screenshot-input"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { reviewBadge } from "@/lib/ledger"
import { coverPeriod, ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { longDate } from "@/lib/time"

export const Route = createFileRoute("/_app/subscription")({ component: BillingScreen })

const STATUS_BADGE: Record<string, BadgeVariant> = { trialing: "brand", active: "paid", past_due: "warn", disabled: "owed" }

function titleize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// §17 — the owner's billing screen. Never write-locked: an owner must always
// be able to reach the screen that restores their access.
function BillingScreen() {
  usePage("Billing", undefined, { narrow: true })
  const { data } = useQuery({ queryKey: ["billing"], queryFn: api.billing })
  if (!data) return <Loading />
  return <BillingView data={data} />
}

function BillingView({ data }: { data: Billing }) {
  const { subscription, operator } = data
  // One plan, paid a year at a time: the request is always for twelve months.
  const [amount, setAmount] = useState(String(operator.annual_price_cents / 100))
  const [method, setMethod] = useState("")
  const [reference, setReference] = useState("")
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [formKey, setFormKey] = useState(0)

  const submit = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.set("amount", amount)
      form.set("months", "12")
      form.set("method", method)
      form.set("reference", reference)
      if (screenshot) form.set("screenshot", screenshot)
      return api.submitSubscriptionPayment(form)
    },
    onSuccess: async (result) => {
      flashNotice(result.notice)
      setReference("")
      setScreenshot(null)
      setFormKey(formKey + 1)
      await refreshAll()
    },
  })

  return (
    <div className="grid gap-5">
      <Panel>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant={STATUS_BADGE[subscription.status] ?? "muted"}>{subscription.status_label}</Badge>
          <span className="text-sm text-muted-foreground">{subscription.summary}</span>
        </div>
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="tabular text-4xl font-semibold tracking-tight">{ngultrum(operator.annual_price_cents)}</span>
          <span className="text-muted-foreground">/ year</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">Billed annually — one payment covers twelve months.</div>
        <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
          Paid through <span className="font-medium text-foreground">{longDate(subscription.current_period_end)}</span>. Your customers always keep read access, whatever happens here.
        </p>
      </Panel>

      <Panel title="How to pay" description={operator.instructions || undefined}>
        <div className="rounded-xl border bg-muted/20 px-3.5 py-2">
          {(
            [
              ["Bank", operator.bank_name],
              ["Account name", operator.account_name],
              ["Account number", operator.account_number],
              ["Branch", operator.branch],
            ] as const
          )
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <KV key={key} label={key}>
                <span className={key === "Account number" ? "tabular select-all" : undefined}>{value}</span>
              </KV>
            ))}
        </div>
      </Panel>

      <Panel title="Submit your payment" description={`${ngultrum(operator.annual_price_cents)} for one year of Bangkee.`}>
        <form
          key={formKey}
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            submit.mutate()
          }}
        >
          <ErrorBox errors={validationErrors(submit.error)} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Amount transferred" hint="One year" htmlFor="amount">
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">Nu.</span>
                <Input id="amount" inputMode="decimal" required className="tabular pl-10" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </Field>
            <Field label="How you paid" htmlFor="method">
              <NativeSelect id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                <NativeSelectOption value="">Choose</NativeSelectOption>
                {["Bank transfer", "Mobile wallet", "Cash"].map((option) => (
                  <NativeSelectOption key={option}>{option}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Reference number" hint="Optional" htmlFor="reference">
            <Input id="reference" className="tabular" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <ScreenshotInput id="screenshot" label="Transfer screenshot" hint="Required" onChange={setScreenshot} />
          <FormActions>
            <Button type="submit" size="lg" disabled={submit.isPending}>
              Send to Bangkee
            </Button>
          </FormActions>
        </form>
      </Panel>

      <Panel flush title="Payment history">
        {data.payments.length > 0 ? (
          <Rows>
            {data.payments.map((payment) => (
              <Row
                key={payment.id}
                title={<span className="tabular">{`${ngultrum(payment.amount_cents)} · ${coverPeriod(payment.months)}`}</span>}
                subtitle={`${longDate(payment.created_at)}${payment.payment_method ? ` · ${payment.payment_method}` : ""}${payment.status === "rejected" && payment.rejection_reason ? ` · ${payment.rejection_reason}` : ""}`}
                trailing={<Badge variant={reviewBadge(payment.status)}>{titleize(payment.status)}</Badge>}
              />
            ))}
          </Rows>
        ) : (
          <Empty icon={ReceiptTextIcon}>No payments submitted yet.</Empty>
        )}
      </Panel>
    </div>
  )
}
