import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { HistoryIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import { PAYMENT_METHODS, type TransactionDetail } from "@/api/types"
import { AmountField } from "@/components/amount"
import { AppLink } from "@/components/app-link"
import { ErrorBox, Field, FormActions, Loading } from "@/components/form"
import { Note, Panel } from "@/components/kit"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/time"

export const Route = createFileRoute("/_app/transactions/$id/edit")({ component: EditTransaction })

function EditTransaction() {
  const id = Number(Route.useParams().id)
  const { data } = useQuery({ queryKey: ["transaction", id], queryFn: () => api.transaction(id) })
  usePage("Edit transaction", data ? `/accounts/${data.account.id}` : undefined, { narrow: true })
  if (!data) return <Loading />
  return <EditForm detail={data} />
}

function EditForm({ detail }: { detail: TransactionDetail }) {
  const { transaction, account } = detail
  const [amount, setAmount] = useState(String(transaction.amount_cents / 100))
  const [description, setDescription] = useState(transaction.description ?? "")
  const [method, setMethod] = useState(transaction.payment_method ?? "Cash")
  const [notes, setNotes] = useState(transaction.notes ?? "")
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocal(transaction.occurred_at))
  const credit = transaction.kind === "credit"

  const save = useMutation({
    mutationFn: () =>
      api.updateTransaction(transaction.id, {
        amount,
        description: credit ? description : undefined,
        payment_method: credit ? undefined : method,
        notes,
        occurred_at: fromDatetimeLocal(occurredAt),
      }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      go(`/accounts/${result.account_id}`)
    },
  })

  return (
    <div className="grid gap-5">
      <Note icon={HistoryIcon}>Editing is recorded in the audit log. To remove an entry from the balance entirely, void it instead — the record stays either way.</Note>
      <Panel>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <ErrorBox errors={validationErrors(save.error)} />

          <AmountField label="Amount" tone={transaction.kind} value={amount} onChange={setAmount} />

          {credit ? (
            <Field label="What was taken" htmlFor="description">
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          ) : (
            <Field label="How they paid" htmlFor="payment_method">
              <NativeSelect id="payment_method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((option) => (
                  <NativeSelectOption key={option}>{option}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}

          <Field label="Note" htmlFor="notes">
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <Field label="Date" htmlFor="occurred_at">
            <Input id="occurred_at" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>

          <FormActions>
            <AppLink href={`/accounts/${account.id}`} className={buttonVariants({ variant: "ghost", size: "lg" })}>
              Cancel
            </AppLink>
            <Button type="submit" size="lg" disabled={save.isPending}>
              Save changes
            </Button>
          </FormActions>
        </form>
      </Panel>
    </div>
  )
}
