import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { api } from "@/api/client"
import type { AccountSummary } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { ErrorBox, Field, FormActions } from "@/components/form"
import { Panel } from "@/components/kit"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { confirm } from "@/lib/confirm"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { refreshAll } from "@/lib/query"

/** Adding a customer, or correcting one (accounts/_form). */
export function AccountForm({ account }: { account?: AccountSummary }) {
  const [name, setName] = useState(account?.customer_name ?? "")
  const [phone, setPhone] = useState(account?.customer_phone ?? "")

  const save = useMutation({
    mutationFn: async () => {
      const input = { customer_name: name, customer_phone: phone }
      if (account) {
        const result = await api.updateAccount(account.id, input)
        return { notice: result.notice, id: account.id }
      }
      const result = await api.createAccount(input)
      return { notice: result.notice, id: result.account_id }
    },
    onSuccess: async ({ notice, id }) => {
      flashNotice(notice)
      await refreshAll()
      // Someone new is sent their invite straight away.
      go(account ? `/accounts/${id}` : `/accounts/${id}/invite`)
    },
  })

  const remove = useMutation({
    mutationFn: () => api.deleteAccount(account!.id),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      go("/accounts")
    },
  })

  async function onRemove() {
    if (!account) return
    const ok = await confirm(
      `Remove ${account.display_name}?|This destroys the account with all its transactions, line items and audit events. ` +
        "If they have only settled up, keep the account — it will simply show as Settled. This cannot be undone.",
      { danger: true },
    )
    if (ok) remove.mutate()
  }

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
        <Field label="Customer name" htmlFor="customer_name">
          <Input id="customer_name" required autoFocus placeholder="e.g. Tashi Wangmo" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone" hint="Their invite goes to this number" htmlFor="customer_phone">
          <Input id="customer_phone" type="tel" required autoComplete="off" className="tabular" placeholder="17 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {!account && <p className="text-sm text-muted-foreground">Next, send them their invite on WhatsApp or by SMS. They join with just their name and a PIN, and can watch their own balance.</p>}
        <FormActions>
          <AppLink href={account ? `/accounts/${account.id}` : "/accounts"} className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Cancel
          </AppLink>
          <Button type="submit" size="lg" disabled={save.isPending}>
            {account ? "Save changes" : "Save customer"}
          </Button>
        </FormActions>
        {account && (
          <div className="border-t pt-4">
            <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onRemove} disabled={remove.isPending}>
              Remove this account…
            </Button>
          </div>
        )}
      </form>
    </Panel>
  )
}
