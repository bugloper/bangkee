import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useState } from "react"

import { api } from "@/api/client"
import { AuthFrame } from "@/components/auth-frame"
import { ErrorBox, Field } from "@/components/form"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/password-input"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { isAdminHost } from "@/lib/host"
import { meQuery } from "@/lib/me"
import { usePage } from "@/lib/page"
import { queryClient } from "@/lib/query"

export const Route = createFileRoute("/_auth/registration/new")({
  beforeLoad: async ({ context }) => {
    // The console has no sign-up: staff accounts are made by hand.
    if (isAdminHost()) throw redirect({ to: "/session/new" })
    if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({ to: "/dashboard" })
  },
  component: Register,
})

// A visitor arriving from an invite link is signing up as a customer; anyone
// else who reaches this page is opening a shop.
function Register() {
  const info = useQuery({ queryKey: ["registration"], queryFn: api.registration })
  const invited = info.data?.invited ?? false
  usePage(invited ? "Create your account" : "Create your shop account")

  const [form, setForm] = useState({ name: "", shop_name: "", email_address: "", phone: "", password: "" })
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value })

  const register = useMutation({
    mutationFn: () => api.register({ ...form, shop_name: invited ? undefined : form.shop_name }),
    onSuccess: async (result) => {
      queryClient.clear()
      await queryClient.fetchQuery({ queryKey: ["me"], queryFn: api.me })
      flashNotice(result.notice)
      go("/dashboard", { replace: true })
    },
  })

  return (
    <AuthFrame
      title={invited ? "Create your account" : "Create your shop account"}
      description={invited ? "So you can see your balance whenever you want." : "Free for 3 months. Nothing to pay to start."}
      footer={
        <>
          Already have an account?{" "}
          <Link to="/session/new" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          register.mutate()
        }}
      >
        <ErrorBox errors={validationErrors(register.error)} />
        <Field label="Your name" htmlFor="name">
          <Input id="name" required autoFocus placeholder="Karma Dorji" value={form.name} onChange={set("name")} />
        </Field>
        {!invited && (
          <Field label="Shop name" htmlFor="shop_name">
            <Input id="shop_name" required placeholder="Karma General Shop" value={form.shop_name} onChange={set("shop_name")} />
          </Field>
        )}
        <Field label="Email" htmlFor="email_address">
          <Input id="email_address" type="email" required autoComplete="username" placeholder="karma@example.bt" value={form.email_address} onChange={set("email_address")} />
        </Field>
        <Field label="Phone" hint="Optional" htmlFor="phone">
          <Input id="phone" type="tel" placeholder="17 00 00 00" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" required autoComplete="new-password" placeholder="At least 8 characters" value={form.password} onChange={set("password")} />
        </Field>
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={register.isPending}>
          {invited ? "Create account" : "Create shop"}
        </Button>
      </form>
    </AuthFrame>
  )
}
