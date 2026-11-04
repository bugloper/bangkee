import { createFileRoute } from "@tanstack/react-router"

import { AccountForm } from "@/components/account-form"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_app/accounts/new")({ component: NewAccount })

function NewAccount() {
  usePage("Add customer", "/accounts", { narrow: true })
  return <AccountForm />
}
