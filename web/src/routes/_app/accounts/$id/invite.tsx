import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CheckIcon, CopyIcon, KeyRoundIcon, MessageCircleIcon, MessageSquareTextIcon, ShieldAlertIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { Invite } from "@/api/types"
import { Field, Loading } from "@/components/form"
import { Initial, Note, Panel } from "@/components/kit"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { confirm } from "@/lib/confirm"
import { useMe } from "@/lib/me"
import { usePage } from "@/lib/page"
import { smsLink, whatsappLink } from "@/lib/phone"
import { queryClient } from "@/lib/query"
import { dateTime } from "@/lib/time"

export const Route = createFileRoute("/_app/accounts/$id/invite")({ component: InviteScreen })

// Sending a customer their invite. Bangkee does not text anyone itself: the
// owner's own WhatsApp or SMS opens with the customer's number and the
// message written, and the owner presses send.
function InviteScreen() {
  const id = Number(Route.useParams().id)
  usePage("Send invite", `/accounts/${id}`, { narrow: true })
  const { data } = useQuery({ queryKey: ["invite", id], queryFn: () => api.invite(id) })
  if (!data) return <Loading />
  return <InviteView id={id} data={data} />
}

function InviteView({ id, data }: { id: number; data: Invite }) {
  const me = useMe()
  const [copied, setCopied] = useState(false)
  const { account } = data
  const url = `${window.location.origin}${data.invite_path}`
  const shop = me?.shop?.name ?? "my shop"
  const resetting = data.pin_reset_until != null
  const message = resetting
    ? `${shop}: open this link to set a new Bangkee PIN. It works until ${dateTime(data.pin_reset_until!)}. ${url}`
    : `${shop} keeps your credit on Bangkee. See your balance any time — open this link and join with your name: ${url}`

  const reset = useMutation({
    mutationFn: () => api.pinReset(id),
    onSuccess: (fresh) => queryClient.setQueryData(["invite", id], fresh),
  })

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="flex items-center gap-3">
          <Initial text={account.display_name} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold tracking-tight">{account.display_name}</div>
            <div className="tabular text-sm text-muted-foreground">{data.phone}</div>
          </div>
        </div>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {resetting
            ? `This link lets ${account.customer_name} choose a new PIN until ${dateTime(data.pin_reset_until!)}. Their old link no longer works.`
            : account.joined
              ? "They have already joined. The link still works if they sign in on another phone."
              : `Send this to ${account.customer_name}. They open it, type their name and choose a PIN — then they can see their balance, get a note when something is added, and upload payment proofs.`}
        </p>

        <div className="mt-5 grid gap-2">
          <a href={whatsappLink(data.phone, message)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "payment", size: "lg", className: "h-12 text-base" })}>
            <MessageCircleIcon /> Send on WhatsApp
          </a>
          <a href={smsLink(data.phone, message)} className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 text-base" })}>
            <MessageSquareTextIcon /> Send by SMS
          </a>
        </div>

        <Field label="Or copy the link" htmlFor="invite" className="mt-6">
          <div className="flex gap-2">
            <Input id="invite" readOnly value={url} className="font-mono text-[0.8125rem]" onFocus={(event) => event.target.select()} />
            <Button variant="outline" onClick={copy} aria-label="Copy link">
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>
        </Field>

        <Note tone="warn" icon={ShieldAlertIcon} className="mt-6">
          Anyone with this link can join as {account.customer_name}, so send it to their number only — not to a group.
        </Note>
      </Panel>

      {data.pin_customer && (
        <Panel title="Forgot their PIN?" description="Send a fresh link that lets them choose a new one for a day. The old link stops working.">
          <Button
            variant="outline"
            disabled={reset.isPending}
            onClick={async () => {
              if (await confirm(`Send ${account.customer_name} a new PIN link?|Their current link stops working. Send the new one to their number only.`)) reset.mutate()
            }}
          >
            <KeyRoundIcon /> Make a new PIN link
          </Button>
        </Panel>
      )}
    </div>
  )
}
