import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

import { api } from "@/api/client"
import { AuthFrame } from "@/components/auth-frame"
import { Field } from "@/components/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_auth/passwords/new")({ component: ResetPassword })

function ResetPassword() {
  usePage("Reset your password")
  const [email, setEmail] = useState("")
  const send = useMutation({
    mutationFn: () => api.requestPasswordReset({ email_address: email }),
    onSuccess: (result) => {
      flashNotice(result.notice)
      go("/session/new")
    },
  })

  return (
    <AuthFrame
      title="Reset your password"
      description="We will send a reset link to your email."
      footer={
        <Link to="/session/new" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          send.mutate()
        }}
      >
        <Field label="Email" htmlFor="email_address">
          <Input id="email_address" type="email" required autoFocus autoComplete="username" placeholder="karma@example.bt" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={send.isPending}>
          Send reset link
        </Button>
      </form>
    </AuthFrame>
  )
}
