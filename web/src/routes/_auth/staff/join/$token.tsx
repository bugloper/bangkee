import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { api, ApiError } from "@/api/client"
import { AuthFrame } from "@/components/auth-frame"
import { ErrorBox, Field } from "@/components/form"
import { PasswordInput } from "@/components/password-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { usePage } from "@/lib/page"
import { queryClient } from "@/lib/query"

export const Route = createFileRoute("/_auth/staff/join/$token")({ component: JoinStaff })

const ROLE_LINE: Record<string, string> = {
  manager: "You can record and correct entries, and look after customers, items, plans and suppliers.",
  cashier: "You can add customers and record credits and payments.",
  viewer: "You can read the book: customers, entries and statements.",
}

// /staff/join/:token — the link an owner sends someone joining the shop's
// staff. They choose a password; their email is the one the owner invited.
function JoinStaff() {
  usePage("Join the shop")
  const { token } = Route.useParams()
  const { data, error } = useQuery({ queryKey: ["staff-invitation", token], queryFn: () => api.staffInvitation(token), retry: false, meta: { handlesErrors: true } })
  const [name, setName] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const join = useMutation({
    mutationFn: () => api.acceptStaffInvitation(token, { name: name ?? data?.name ?? "", password }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await queryClient.invalidateQueries()
      go("/dashboard", { replace: true })
    },
  })

  if (error) {
    return (
      <AuthFrame title="This link does not work" description={error instanceof ApiError ? error.message : "Try again later."}>
        <p className="text-sm text-muted-foreground">Ask the shop owner to send a new invitation.</p>
      </AuthFrame>
    )
  }
  if (!data) return null

  return (
    <AuthFrame title={`Join ${data.shop_name}`} description={`As ${data.role_name.toLowerCase()}. ${ROLE_LINE[data.role] ?? ""}`}>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          join.mutate()
        }}
      >
        <ErrorBox errors={validationErrors(join.error)} />
        <Field label="Your name" htmlFor="name">
          <Input id="name" required autoComplete="name" value={name ?? data.name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Email" htmlFor="email" hint="You sign in with this">
          <Input id="email" readOnly value={data.email_address} />
        </Field>
        <Field label="Choose a password" htmlFor="password" hint="At least 8 characters">
          <PasswordInput id="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        <Button type="submit" size="lg" disabled={join.isPending}>
          Join {data.shop_name}
        </Button>
      </form>
    </AuthFrame>
  )
}
