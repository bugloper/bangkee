import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { api, ApiError } from "@/api/client"
import { AuthFrame } from "@/components/auth-frame"
import { Field } from "@/components/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { flashAlert, flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_auth/passwords/$token/edit")({ component: NewPassword })

function NewPassword() {
  usePage("Set a new password")
  const { token } = Route.useParams()
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")

  // A stale or tampered link goes back to asking for a new one.
  const check = useQuery({ queryKey: ["password-token", token], queryFn: () => api.checkPasswordToken(token), retry: false, meta: { handlesErrors: true } })
  useEffect(() => {
    if (check.error) {
      flashAlert(check.error instanceof ApiError ? check.error.body.error : "Password reset link is invalid or has expired.")
      go("/passwords/new", { replace: true })
    }
  }, [check.error])

  const save = useMutation({
    mutationFn: () => api.updatePassword(token, { password, password_confirmation: confirmation }),
    onSuccess: (result) => {
      flashNotice(result.notice)
      go("/session/new")
    },
  })

  return (
    <AuthFrame title="Set a new password" description="This signs out all other sessions.">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <Field label="New password" htmlFor="password">
          <Input id="password" type="password" required autoFocus autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Repeat password" htmlFor="password_confirmation">
          <Input id="password_confirmation" type="password" required autoComplete="new-password" placeholder="Same again" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={save.isPending}>
          Save new password
        </Button>
      </form>
    </AuthFrame>
  )
}
