import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CalendarClockIcon, CrownIcon } from "lucide-react"
import { useState } from "react"

import { api, ApiError } from "@/api/client"
import type { Installment, InstallmentPlan } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { ErrorBox, Field, FormActions, Loading } from "@/components/form"
import { Empty, Money, Note, Panel } from "@/components/kit"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { confirm } from "@/lib/confirm"
import { flashNotice } from "@/lib/flash"
import { useFeature, useMe } from "@/lib/me"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { longDate } from "@/lib/time"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/accounts/$id/installments")({ component: InstallmentsScreen })

const dayOf = (timestamp: string) => longDate(timestamp.slice(0, 10) + "T00:00")

const STATUS: Record<Installment["status"], [string, BadgeVariant]> = {
  paid: ["Paid", "paid"],
  partial: ["Part paid", "warn"],
  overdue: ["Overdue", "owed"],
  due_today: ["Due today", "warn"],
  upcoming: ["Upcoming", "muted"],
}

// Paying what is owed in parts. The plan is the agreed dates and amounts;
// what has been paid comes from the payments in the book, so recording a
// payment as usual is all it takes to move the plan on.
function InstallmentsScreen() {
  const id = Number(Route.useParams().id)
  usePage("Installments", `/accounts/${id}`, { narrow: true })
  const me = useMe()
  const owner = me?.user.role === "shop_owner"
  const { data } = useQuery({ queryKey: ["installments", id], queryFn: () => api.installmentPlans(id) })
  if (!data) return <Loading />
  const current = data.plans.find((plan) => plan.status === "active")
  const past = data.plans.filter((plan) => plan !== current)

  return (
    <div className="grid gap-5">
      {current ? (
        <PlanCard plan={current} owner={owner} />
      ) : owner ? (
        <NewPlan accountId={id} balance={data.balance_cents} />
      ) : (
        <Panel>
          <Empty icon={CalendarClockIcon} title="No installment plan">
            If you would like to pay in parts, ask the shop to set up a plan.
          </Empty>
        </Panel>
      )}
      {past.length > 0 && (
        <div className="grid gap-3">
          <h2 className="px-1 text-base font-semibold tracking-tight">Earlier plans</h2>
          {past.map((plan) => (
            <PlanCard key={plan.id} plan={plan} owner={false} compact />
          ))}
        </div>
      )}
    </div>
  )
}

function PlanCard({ plan, owner, compact = false }: { plan: InstallmentPlan; owner: boolean; compact?: boolean }) {
  const cancel = useMutation({
    mutationFn: () => api.cancelInstallmentPlan(plan.id),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })
  const share = Math.round((plan.paid_cents / plan.total_cents) * 100)
  return (
    <Panel
      title={`${ngultrum(plan.total_cents)} in ${plan.installment_count} ${plan.frequency} installments`}
      description={`Agreed ${longDate(plan.created_at)} by ${plan.created_by_name}${plan.notes ? ` · ${plan.notes}` : ""}`}
      action={plan.status !== "active" && <Badge variant={plan.status === "completed" ? "paid" : "muted"}>{plan.status === "completed" ? "Paid off" : "Cancelled"}</Badge>}
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">Paid so far</div>
          <Money cents={plan.paid_cents} tone="paid" className="text-2xl font-semibold" />
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Left to pay</div>
          <Money cents={plan.remaining_cents} className="text-2xl font-semibold" />
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the plan paid">
        <div className="h-full rounded-full bg-paid" style={{ width: `${share}%` }} />
      </div>
      {plan.overdue_count > 0 && plan.status === "active" && (
        <Note tone="warn" className="mt-4">
          {ngultrum(plan.overdue_cents)} is late across {plan.overdue_count === 1 ? "1 installment" : `${plan.overdue_count} installments`}.
        </Note>
      )}

      {!compact && (
        <ol className="mt-5 divide-y rounded-xl border">
          {plan.installments.map((installment) => {
            const [label, variant] = STATUS[installment.status]
            return (
              <li key={installment.number} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">
                    {installment.number}. {dayOf(installment.due_on)}
                  </span>
                  {installment.status === "partial" || (installment.status === "overdue" && installment.paid_cents > 0) ? (
                    <span className="block text-xs text-muted-foreground">{ngultrum(installment.paid_cents)} paid</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2.5">
                  <span className={cn("tabular", installment.status === "paid" && "text-muted-foreground line-through")}>{ngultrum(installment.amount_cents)}</span>
                  <Badge variant={variant}>{label}</Badge>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {!compact && plan.status === "active" && (
        <p className="mt-4 text-[0.8125rem] text-muted-foreground">Payments recorded in the book count towards the plan, oldest first. Paying more covers the next installments early.</p>
      )}
      {owner && plan.status === "active" && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          disabled={cancel.isPending}
          onClick={async () => {
            if (await confirm("Cancel this plan?|Payments already made still count, and the balance stays as it is.", { danger: true })) cancel.mutate()
          }}
        >
          Cancel plan
        </Button>
      )}
    </Panel>
  )
}

const tomorrow = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function NewPlan({ accountId, balance }: { accountId: number; balance: number }) {
  const allowed = useFeature("installments")
  const [total, setTotal] = useState(String(balance / 100))
  const [count, setCount] = useState(3)
  const [frequency, setFrequency] = useState("monthly")
  const [first, setFirst] = useState(tomorrow)
  const [notes, setNotes] = useState("")
  const [errors, setErrors] = useState<string[]>([])
  const create = useMutation({
    mutationFn: () => api.createInstallmentPlan(accountId, { total, count, frequency, first_due_on: first, notes }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      setErrors([])
      await refreshAll()
    },
    onError: (error) => setErrors(error instanceof ApiError ? error.validation : []),
  })
  if (balance <= 0) {
    return (
      <Panel>
        <Empty icon={CalendarClockIcon} title="Nothing owed">
          An installment plan can be set up when the customer owes something.
        </Empty>
      </Panel>
    )
  }
  const each = Number(total) > 0 && count > 0 ? (Number(total) * 100) / count : 0

  return (
    <Panel title="Set up an installment plan" description={`They owe ${ngultrum(balance)}. Agree how they pay it back, in parts.`}>
      {!allowed ? (
        <Note icon={CrownIcon}>
          Installment plans come with the Pro and Business plans.{" "}
          <AppLink href="/subscription" className="font-medium text-primary hover:underline">
            See plans
          </AppLink>
        </Note>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <ErrorBox errors={errors} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (Nu.)" htmlFor="total">
              <Input id="total" inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} />
            </Field>
            <Field label="Installments" htmlFor="count">
              <NativeSelect id="count" value={String(count)} onChange={(event) => setCount(Number(event.target.value))}>
                {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                  <NativeSelectOption key={n} value={n}>
                    {n}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Every" htmlFor="frequency">
              <NativeSelect id="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)}>
                <NativeSelectOption value="weekly">Week</NativeSelectOption>
                <NativeSelectOption value="fortnightly">Two weeks</NativeSelectOption>
                <NativeSelectOption value="monthly">Month</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="First due" htmlFor="first">
              <Input id="first" type="date" value={first} min={tomorrow()} onChange={(event) => setFirst(event.target.value)} />
            </Field>
          </div>
          <Field label="Note (optional)" htmlFor="notes">
            <Input id="notes" value={notes} maxLength={200} placeholder="e.g. paid from each month's salary" onChange={(event) => setNotes(event.target.value)} />
          </Field>
          {each > 0 && <p className="text-sm text-muted-foreground">About {ngultrum(Math.floor(each))} each. The customer is told about the plan and can see it.</p>}
          <FormActions>
            <Button type="submit" disabled={create.isPending}>
              Agree the plan
            </Button>
          </FormActions>
        </form>
      )}
    </Panel>
  )
}
