import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { api } from "@/api/client"
import type { InvitationResult } from "@/api/types"
import { ErrorBox, Field } from "@/components/form"
import { Initial } from "@/components/kit"
import { PinInput } from "@/components/pin-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashAlert, flashNotice } from "@/lib/flash"
import { go, rememberReturnPath } from "@/lib/go"
import { usePage } from "@/lib/page"
import { queryClient } from "@/lib/query"

export const Route = createFileRoute("/_auth/join/$token")({ component: Invitation })

type Landing = Extract<InvitationResult, { outcome: "landing" }>

// /join/:token — the link a shop owner sends a customer. Signed in, it links
// the account and moves on. Signed out, it asks for no more than it must:
//   join    — new to Bangkee: their name and a PIN, and they are in
//   sign_in — they already have a login: phone and PIN, then back here
//   new_pin — the shop sent a fresh link for a forgotten PIN
function Invitation() {
  usePage("You're invited")
  const { token } = Route.useParams()
  const { data } = useQuery({ queryKey: ["invitation", token], queryFn: () => api.invitation(token), staleTime: Infinity, retry: false })

  useEffect(() => {
    if (!data) return
    // Signing in from here comes straight back and links the account.
    if (data.outcome === "landing") rememberReturnPath(`/join/${token}`)
    else if (data.outcome === "claimed" || data.outcome === "already_yours") {
      flashNotice(data.notice)
      void queryClient.invalidateQueries()
      go(`/accounts/${data.account_id}`, { replace: true })
    } else if (data.outcome === "refused") {
      flashAlert(data.alert)
      go("/dashboard", { replace: true })
    }
  }, [data, token])

  if (data?.outcome !== "landing") return null

  return (
    <div className="w-full max-w-sm">
      <div className="text-center">
        <div className="flex justify-center">
          <Initial text={data.shop_name} size="xl" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          {data.shop_name}
          <br />
          <span className="text-muted-foreground">{data.next === "new_pin" ? "Choose a new PIN" : data.next === "sign_in" ? "Welcome back" : "invites you to Bangkee"}</span>
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {data.next === "join"
            ? "See your credit balance at this shop any time, and get a note when something is added — free."
            : data.next === "sign_in"
              ? `You already have a Bangkee login. Sign in to see your account at ${data.shop_name}.`
              : "Your old PIN stops working once you choose a new one."}
        </p>
      </div>
      <div className="mt-8">
        {data.next === "join" && <JoinForm token={token} data={data} />}
        {data.next === "sign_in" && <SignInForm token={token} data={data} />}
        {data.next === "new_pin" && <NewPinForm token={token} />}
      </div>
      <div className="tabular mt-6 text-center text-xs text-muted-foreground">
        {window.location.host}/join/{data.token_prefix}…
      </div>
    </div>
  )
}

async function arrive(accountId: number, notice: string) {
  flashNotice(notice)
  queryClient.clear()
  await queryClient.fetchQuery({ queryKey: ["me"], queryFn: api.me })
  go(`/accounts/${accountId}`, { replace: true })
}

function JoinForm({ token, data }: { token: string; data: Landing }) {
  const [name, setName] = useState(data.customer_name)
  const [pin, setPin] = useState("")
  const [again, setAgain] = useState("")
  const [mismatch, setMismatch] = useState(false)
  const join = useMutation({
    mutationFn: () => api.joinWithPin(token, { name, pin }),
    onSuccess: (result) => arrive(result.account_id, result.notice),
  })
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setMismatch(pin !== again)
        if (pin === again) join.mutate()
      }}
    >
      <ErrorBox errors={[...(mismatch ? ["The two PINs are not the same."] : []), ...validationErrors(join.error)]} />
      <Field label="Your name" htmlFor="name">
        <Input id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Choose a 4-digit PIN" hint={`You sign in with ${data.phone} and this PIN`} htmlFor="pin">
        <PinInput id="pin" fresh value={pin} onChange={setPin} />
      </Field>
      <Field label="The same PIN again" htmlFor="pin_again">
        <PinInput id="pin_again" fresh value={again} onChange={setAgain} />
      </Field>
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={join.isPending}>
        Join
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Have an email login?{" "}
        <Link to="/session/new" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}

function SignInForm({ token, data }: { token: string; data: Landing }) {
  const [phone, setPhone] = useState(data.phone)
  const [pin, setPin] = useState("")
  const signIn = useMutation({
    mutationFn: () => api.signIn({ phone, pin }),
    onSuccess: async () => {
      queryClient.clear()
      await queryClient.fetchQuery({ queryKey: ["me"], queryFn: api.me })
      // Back to the link, which now joins them and moves on.
      go(`/join/${token}`, { replace: true })
    },
  })
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        signIn.mutate()
      }}
    >
      <Field label="Phone" htmlFor="phone">
        <Input id="phone" type="tel" required autoComplete="tel" className="tabular" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="PIN" hint="Forgot it? Ask the shop for a new link" htmlFor="pin">
        <PinInput id="pin" autoFocus value={pin} onChange={setPin} />
      </Field>
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={signIn.isPending}>
        Sign in
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Use an email instead?{" "}
        <Link to="/session/new" className="font-medium text-primary hover:underline">
          Sign in with email
        </Link>
      </p>
    </form>
  )
}

function NewPinForm({ token }: { token: string }) {
  const [pin, setPin] = useState("")
  const [again, setAgain] = useState("")
  const [mismatch, setMismatch] = useState(false)
  const save = useMutation({
    mutationFn: () => api.newPin(token, pin),
    onSuccess: (result) => arrive(result.account_id, result.notice),
  })
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setMismatch(pin !== again)
        if (pin === again) save.mutate()
      }}
    >
      <ErrorBox errors={[...(mismatch ? ["The two PINs are not the same."] : []), ...validationErrors(save.error)]} />
      <Field label="New 4-digit PIN" htmlFor="pin">
        <PinInput id="pin" fresh autoFocus value={pin} onChange={setPin} />
      </Field>
      <Field label="The same PIN again" htmlFor="pin_again">
        <PinInput id="pin_again" fresh value={again} onChange={setAgain} />
      </Field>
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={save.isPending}>
        Set PIN and sign in
      </Button>
    </form>
  )
}
