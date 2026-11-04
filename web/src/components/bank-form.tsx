import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { api } from "@/api/client"
import type { BankAccount, BankAccountInput } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { Check, ErrorBox, Field, FormActions } from "@/components/form"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { refreshAll } from "@/lib/query"

/** §16 — a published payment destination (bank_accounts/_form). */
export function BankForm({ bank, defaultPrimary = false }: { bank?: BankAccount; defaultPrimary?: boolean }) {
  const [form, setForm] = useState<BankAccountInput>({
    bank_name: bank?.bank_name ?? "",
    account_name: bank?.account_name ?? "",
    account_number: bank?.account_number ?? "",
    branch: bank?.branch ?? "",
    instructions: bank?.instructions ?? "",
    primary: bank?.primary ?? defaultPrimary,
    active: bank?.active ?? true,
  })
  const set = (key: keyof BankAccountInput) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: event.target.value })

  const save = useMutation({
    mutationFn: () => (bank ? api.updateBankAccount(bank.id, form) : api.createBankAccount(form)),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      if (!bank) setForm({ ...form, bank_name: "", account_name: "", account_number: "", branch: "", instructions: "", primary: false })
      go("/bank_accounts")
    },
  })

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <ErrorBox errors={validationErrors(save.error)} />
      <Field label="Bank" htmlFor="bank_name">
        <Input id="bank_name" required placeholder="Bank of Bhutan" value={form.bank_name} onChange={set("bank_name")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Account name" htmlFor="account_name">
        <Input id="account_name" required placeholder="Karma General Shop" value={form.account_name} onChange={set("account_name")} />
      </Field>
      <Field label="Account number" htmlFor="account_number">
        <Input id="account_number" required className="tabular" placeholder="1023 4567 8901" value={form.account_number} onChange={set("account_number")} />
      </Field>
      </div>
      <Field label="Branch" hint="Optional" htmlFor="branch">
        <Input id="branch" placeholder="Thimphu Main" value={form.branch} onChange={set("branch")} />
      </Field>
      <Field label="Payment instructions" hint="Optional — shown to customers" htmlFor="instructions">
        <Textarea id="instructions" rows={2} placeholder="Send the screenshot after transferring." value={form.instructions} onChange={set("instructions")} />
      </Field>
      <div className="grid gap-3 rounded-xl border p-3.5">
        <Check label="Show this account first to customers" checked={form.primary} onChange={(primary) => setForm({ ...form, primary })} />
        <Check label="Visible to customers" checked={form.active} onChange={(active) => setForm({ ...form, active })} />
      </div>
      <FormActions>
        <AppLink href="/bank_accounts" className={buttonVariants({ variant: "ghost", size: "lg" })}>
          Cancel
        </AppLink>
        <Button type="submit" size="lg" disabled={save.isPending}>
          {bank ? "Save changes" : "Save bank details"}
        </Button>
      </FormActions>
    </form>
  )
}
