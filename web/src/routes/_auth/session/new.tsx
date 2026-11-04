import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

import { api } from "@/api/client"
import { AuthFrame } from "@/components/auth-frame"
import { Field, Segmented } from "@/components/form"
import { PinInput } from "@/components/pin-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { go, takeReturnPath } from "@/lib/go"
import { isAdminHost } from "@/lib/host"
import { usePage } from "@/lib/page"
import { queryClient } from "@/lib/query"

export const Route = createFileRoute("/_auth/session/new")({ component: SignIn })

const PHONE = "Phone & PIN"
const EMAIL = "Email & password"
const MODE_KEY = "bangkee:sign-in-with"

/** The way this phone last signed in: a customer is not asked to switch every time. */
function rememberedMode(): typeof PHONE | typeof EMAIL {
  try {
    return localStorage.getItem(MODE_KEY) === PHONE ? PHONE : EMAIL
  } catch {
    return EMAIL
  }
}

function SignIn() {
  usePage("Sign in")
  const admin = isAdminHost()
  // Staff and shop owners have an email; customers who joined from a link have a phone and PIN.
  const [mode, setMode] = useState<typeof PHONE | typeof EMAIL>(() => (admin ? EMAIL : rememberedMode()))
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [pin, setPin] = useState("")

  const signIn = useMutation({
    mutationFn: () => api.signIn(mode === PHONE ? { phone, pin } : { email_address: email, password }),
    onSuccess: async () => {
      try {
        localStorage.setItem(MODE_KEY, mode)
      } catch {
        // private window: the choice is not remembered, nothing more
      }
      queryClient.clear()
      await queryClient.fetchQuery({ queryKey: ["me"], queryFn: api.me })
      const to = takeReturnPath() ?? (admin ? "/" : "/dashboard")
      go(to.startsWith("/") ? to : "/", { replace: true })
    },
  })

  return (
    <AuthFrame
      title={admin ? "Sign in to the console" : "Welcome back"}
      description={admin ? "Bangkee staff only." : "Sign in to your shared credit book."}
      footer={
        admin ? undefined : (
          <>
            New shop?{" "}
            <Link to="/registration/new" className="font-medium text-primary hover:underline">
              Create your shop account
            </Link>
          </>
        )
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          signIn.mutate()
        }}
      >
        {!admin && <Segmented name="sign_in_with" label="Sign in with" options={[EMAIL, PHONE] as const} value={mode} onChange={setMode} />}
        {mode === PHONE ? (
          <>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" type="tel" required autoFocus autoComplete="tel" className="tabular" placeholder="17 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="PIN" hint="Forgot it? Ask the shop for a new link" htmlFor="pin">
              <PinInput id="pin" value={pin} onChange={setPin} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Email" htmlFor="email_address">
              <Input id="email_address" type="email" required autoFocus autoComplete="username" placeholder="karma@example.bt" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              hint={
                <Link to="/passwords/new" className="font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              }
            >
              <Input id="password" type="password" required autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        )}
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={signIn.isPending}>
          Sign in
        </Button>
      </form>
    </AuthFrame>
  )
}
