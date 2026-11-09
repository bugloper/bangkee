import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CheckIcon, ReceiptTextIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { Billing, PlanKey } from "@/api/types"
import { ChoiceField } from "@/components/choice-field"
import { ErrorBox, Field, FormActions, Loading } from "@/components/form"
import { Empty, KV, Panel, Row, Rows } from "@/components/kit"
import { ScreenshotInput } from "@/components/screenshot-input"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { reviewBadge } from "@/lib/ledger"
import { coverPeriod, ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { longDate } from "@/lib/time"
import { cn } from "@/lib/utils"

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
  // Paid a year at a time: the request is always for twelve months of the chosen plan.
  const [plan, setPlan] = useState<PlanKey>(subscription.plan)
  const chosen = data.plans.find((p) => p.key === plan) ?? data.plans[0]
  const [amount, setAmount] = useState(String(chosen.annual_price_cents / 100))
  const choose = (key: PlanKey) => {
    setPlan(key)
    setAmount(String((data.plans.find((p) => p.key === key)?.annual_price_cents ?? 0) / 100))
  }
  const [method, setMethod] = useState("")
  const [reference, setReference] = useState("")
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [formKey, setFormKey] = useState(0)

  const submit = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.set("amount", amount)
      form.set("plan", plan)
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
        <div className="mt-4 text-sm text-muted-foreground">Your plan</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight">{subscription.plan_name}</span>
          <span className="tabular text-muted-foreground">{ngultrum(subscription.price_cents)} / month, billed annually</span>
        </div>
        {subscription.status === "trialing" && <div className="mt-1 text-sm text-muted-foreground">During the free trial every feature is on, whatever the plan.</div>}
        <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
          Paid through <span className="font-medium text-foreground">{longDate(subscription.current_period_end)}</span>. Your customers always keep read access, whatever happens here.
        </p>
      </Panel>

      <section className="grid gap-3" aria-label="Plans">
        <h2 className="px-1 text-base font-semibold tracking-tight">Choose a plan</h2>
        <div role="radiogroup" aria-label="Plan" className="grid gap-3">
          {data.plans.map((offer) => {
            const selected = offer.key === plan
            return (
              <button
                key={offer.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(offer.key)}
                className={cn("rounded-[1.25rem] border bg-card p-4 text-left transition-colors sm:p-5", selected ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/40")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold tracking-tight">{offer.name}</span>
                    {offer.key === subscription.plan && <Badge variant="muted">Current</Badge>}
                  </div>
                  <div className="text-right">
                    <div className="tabular font-semibold">
                      {ngultrum(offer.monthly_price_cents)}
                      <span className="text-sm font-normal text-muted-foreground"> / month</span>
                    </div>
                    <div className="tabular text-xs text-muted-foreground">{ngultrum(offer.annual_price_cents)} a year</div>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{offer.summary}</p>
                {offer.features.length > 0 && (
                  <ul className="mt-3 grid gap-1 text-sm">
                    {offer.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <CheckIcon className="size-4 shrink-0 text-paid" /> {feature}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            )
          })}
        </div>
        {plan !== subscription.plan && (
          <p className="px-1 text-[0.8125rem] text-muted-foreground">You move to {chosen.name} when Bangkee approves the payment, and the year is added to the cover you already have.</p>
        )}
      </section>

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

      <Panel title="Submit your payment" description={`${ngultrum(chosen.annual_price_cents)} for one year of ${chosen.name}.`}>
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
              <ChoiceField
                id="method"
                title="How you paid"
                value={method}
                onChange={setMethod}
                groups={[{ choices: ["Bank transfer", "Mobile wallet", "Cash"].map((m) => ({ value: m, label: m })) }]}
              />
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
                title={<span className="tabular">{`${ngultrum(payment.amount_cents)} · ${coverPeriod(payment.months)} of ${payment.plan_name}`}</span>}
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
