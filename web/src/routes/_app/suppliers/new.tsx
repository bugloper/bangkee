import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { api } from "@/api/client"
import { ErrorBox, Field, FormActions } from "@/components/form"
import { Panel } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"

export const Route = createFileRoute("/_app/suppliers/new")({ component: NewSupplier })

function NewSupplier() {
  usePage("Add supplier", "/suppliers", { narrow: true })
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const create = useMutation({
    mutationFn: () => api.createSupplier({ name, phone, notes }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      go(`/suppliers/${result.supplier_id}`, { replace: true })
    },
  })
  return (
    <Panel>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <ErrorBox errors={validationErrors(create.error)} />
        <Field label="Name" htmlFor="name">
          <Input id="name" required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Druk Wholesale" />
        </Field>
        <Field label="Phone" hint="Optional" htmlFor="phone">
          <Input id="phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </Field>
        <Field label="Notes" hint="Optional" htmlFor="notes">
          <Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Delivers on Mondays" />
        </Field>
        <FormActions>
          <Button type="submit" size="lg" disabled={create.isPending}>
            Add supplier
          </Button>
        </FormActions>
      </form>
    </Panel>
  )
}
