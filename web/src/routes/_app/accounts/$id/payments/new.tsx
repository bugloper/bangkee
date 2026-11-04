import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CameraIcon, XIcon } from "lucide-react"
import { useRef, useState } from "react"

import { api } from "@/api/client"
import { PAYMENT_METHODS, type RecordedEntry } from "@/api/types"
import { AmountField, Keypad } from "@/components/amount"
import { AppLink } from "@/components/app-link"
import { ErrorBox, Field, FormActions, Loading, Segmented } from "@/components/form"
import { Money, Note, Panel } from "@/components/kit"
import { PaymentScanner } from "@/components/payment-scanner"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { useOnline } from "@/lib/online"
import { usePage } from "@/lib/page"
import { offerNotifications } from "@/lib/pwa"
import { refreshAll } from "@/lib/query"
import { fromDatetimeLocal } from "@/lib/time"
import { writeOrQueue } from "@/lib/write"

export const Route = createFileRoute("/_app/accounts/$id/payments/new")({ component: NewPayment })

// Money received, recorded by the owner. Paid by mBoB, mPay or the like, the
// customer shows the payment screen on their phone; the owner can photograph
// it, and the straightened picture is kept with the payment.
function NewPayment() {
  const id = Number(Route.useParams().id)
  usePage("Record payment", `/accounts/${id}`, { narrow: true })
  const account = useQuery({ queryKey: ["account", id], queryFn: () => api.account(id) })

  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<string>("Cash")
  const [notes, setNotes] = useState("")
  const [occurredAt, setOccurredAt] = useState("")
  const online = useOnline()

  // The photo: the camera's shot while its corners are lined up, then the
  // straightened picture that is sent.
  const camera = useRef<HTMLInputElement>(null)
  const [shot, setShot] = useState<File | null>(null)
  const [photo, setPhotoState] = useState<{ blob: Blob; url: string } | null>(null)
  const setPhoto = (blob: Blob | null) => {
    if (photo) URL.revokeObjectURL(photo.url)
    setPhotoState(blob ? { blob, url: URL.createObjectURL(blob) } : null)
  }

  const save = useMutation({
    mutationFn: () => {
      if (photo) {
        const form = new FormData()
        form.set("amount", amount)
        form.set("payment_method", method)
        form.set("notes", notes)
        const when = fromDatetimeLocal(occurredAt)
        if (when) form.set("occurred_at", when)
        form.set("screenshot", photo.blob, "payment.jpg")
        return api.createPaymentWithPhoto(id, form)
      }
      return writeOrQueue<RecordedEntry>({
        url: `/api/accounts/${id}/payments`,
        body: { amount, payment_method: method, notes, occurred_at: fromDatetimeLocal(occurredAt) },
        queueKey: `account:${id}`,
        label: "payment",
        amount,
        description: method,
        dated: true,
      })
    },
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
  const { display_name, balance_cents } = account.data.account

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
        <AmountField label={`Amount received from ${display_name}`} tone="payment" value={amount} onChange={setAmount} autoFocus>
          <div className="text-sm text-muted-foreground">
            Outstanding now: <Money cents={balance_cents} tone="owed" />
          </div>
        </AmountField>

        <Keypad value={amount} onChange={setAmount} />

        <Field label="How did they pay?">
          <Segmented label="How did they pay?" name="payment_method" options={PAYMENT_METHODS} value={method as (typeof PAYMENT_METHODS)[number]} onChange={setMethod} />
        </Field>

        {method !== "Cash" && (
          <Field label="Photo of their payment screen" hint="Optional">
            {photo ? (
              <div className="flex items-center gap-3">
                <img src={photo.url} alt="The payment screen" className="h-28 rounded-lg border object-contain" />
                <div className="grid gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => camera.current?.click()}>
                    <CameraIcon /> Retake
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(null)}>
                    <XIcon /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" size="lg" className="justify-self-start" onClick={() => camera.current?.click()}>
                <CameraIcon /> Scan their payment screen
              </Button>
            )}
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Take a photo of the payment screen"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                event.target.value = "" // the same photo can be chosen again
                if (file) setShot(file)
              }}
            />
            {photo && !online && <Note tone="warn">The photo needs a connection. Remove it to save the payment on this phone for now.</Note>}
          </Field>
        )}

        <Field label="Note" hint="Optional" htmlFor="notes">
          <Input id="notes" placeholder="e.g. paid at the shop" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <Field label="Date" hint="Optional — defaults to now" htmlFor="occurred_at">
          <Input id="occurred_at" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>

        <FormActions>
          <AppLink href={`/accounts/${id}`} className={buttonVariants({ variant: "ghost", size: "xl" })}>
            Cancel
          </AppLink>
          <Button type="submit" variant="payment" size="xl" disabled={save.isPending || (!!photo && !online)}>
            Save payment
          </Button>
        </FormActions>
      </form>

      {shot && (
        <PaymentScanner
          file={shot}
          onDone={(straightened) => {
            setPhoto(straightened)
            setShot(null)
          }}
          onRetake={() => camera.current?.click()}
          onCancel={() => setShot(null)}
        />
      )}
    </Panel>
  )
}
