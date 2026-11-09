import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { BellRingIcon, MessageCircleIcon, MessageSquareTextIcon } from "lucide-react"

import { api } from "@/api/client"
import type { Reminder } from "@/api/types"
import { Loading } from "@/components/form"
import { Empty, Note, Panel } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { flashNotice } from "@/lib/flash"
import { useCan, useMe } from "@/lib/me"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { smsLink, whatsappLink } from "@/lib/phone"
import { refreshAll } from "@/lib/query"
import { dateTime } from "@/lib/time"

export const Route = createFileRoute("/_app/accounts/$id/reminders")({ component: RemindersScreen })

const CHANNEL: Record<Reminder["channel"], string> = { app: "Bangkee notification", whatsapp: "Your WhatsApp", sms: "Your SMS" }

// Reminding one customer what they owe: through Bangkee (their phone gets a
// notification), or from the owner's own WhatsApp or SMS — which Bangkee
// opens with the message written, and notes in the history.
function RemindersScreen() {
  const id = Number(Route.useParams().id)
  usePage("Reminders", `/accounts/${id}`, { narrow: true })
  const me = useMe()
  const canManage = useCan("manage")
  const account = useQuery({ queryKey: ["account", id], queryFn: () => api.account(id) })
  const history = useQuery({ queryKey: ["reminders", id], queryFn: () => api.accountReminders(id) })
  const done = async (result: { notice?: string }) => {
    flashNotice(result.notice)
    await refreshAll()
  }
  const remind = useMutation({ mutationFn: () => api.remind(id), onSuccess: done })
  const log = useMutation({ mutationFn: (channel: "whatsapp" | "sms") => api.logReminder(id, channel), onSuccess: done })
  const pause = useMutation({ mutationFn: (paused: boolean) => api.pauseReminders(id, paused), onSuccess: done })
  if (!account.data || account.data.viewer !== "owner" || !history.data) return <Loading />
  const a = account.data.account
  const shop = me?.shop?.name ?? "the shop"
  const message =
    `Hello ${a.customer_name}, a reminder from ${shop}: ${ngultrum(a.balance_cents)} is outstanding on your account.` + (a.joined ? " You can see every entry in Bangkee." : "") + " Thank you!"
  const owes = a.balance_cents > 0

  return (
    <div className="grid gap-5">
      <Panel
        title={`Remind ${a.display_name}`}
        description={owes ? `${ngultrum(a.balance_cents)} outstanding${a.overdue ? ` · ${a.days_overdue} days overdue` : ""}` : "Nothing is owed — no reminder needed."}
      >
        <div className="grid gap-2">
          <Button size="lg" className="h-12" disabled={!owes || !a.joined || remind.isPending || history.data.paused} onClick={() => remind.mutate()}>
            <BellRingIcon /> Send a reminder through Bangkee
          </Button>
          {!a.joined && <p className="text-[0.8125rem] text-muted-foreground">{a.customer_name} has not joined Bangkee yet, so remind them from your own phone.</p>}
          {a.customer_phone && owes && (
            <div className="grid grid-cols-2 gap-2">
              <a
                href={whatsappLink(a.customer_phone, message)}
                target="_blank"
                rel="noreferrer"
                onClick={() => log.mutate("whatsapp")}
                className={buttonVariants({ variant: "outline", size: "lg", className: "h-12" })}
              >
                <MessageCircleIcon /> WhatsApp
              </a>
              <a href={smsLink(a.customer_phone, message)} onClick={() => log.mutate("sms")} className={buttonVariants({ variant: "outline", size: "lg", className: "h-12" })}>
                <MessageSquareTextIcon /> SMS
              </a>
            </div>
          )}
        </div>
        {canManage && (
          <label className="mt-5 flex items-center justify-between gap-4 border-t pt-4">
            <span>
              <span className="block text-sm font-medium">Pause reminders</span>
              <span className="block text-[0.8125rem] text-muted-foreground">No automatic or bulk reminders to {a.customer_name} — for someone you have an arrangement with.</span>
            </span>
            <Switch checked={history.data.paused} onCheckedChange={(checked) => pause.mutate(checked)} />
          </label>
        )}
      </Panel>

      {a.overdue && <Note>A customer is only reminded once a day, and never about an entry they have flagged until you settle it.</Note>}

      <Panel flush title="History">
        {history.data.reminders.length > 0 ? (
          <div className="divide-y">
            {history.data.reminders.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {CHANNEL[r.channel]} · {r.kind === "automatic" ? "automatic" : (r.sent_by_name ?? "by hand")}
                  </div>
                  <div className="text-[0.8125rem] text-muted-foreground">
                    {dateTime(r.at)} · owed {ngultrum(r.balance_cents)}
                    {r.detail && ` · ${r.detail}`}
                  </div>
                </div>
                <Badge variant={r.status === "sent" ? "paid" : r.status === "failed" ? "owed" : "muted"}>{r.status === "sent" ? "Sent" : r.status === "failed" ? "Failed" : "Skipped"}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={BellRingIcon} title="No reminders yet" />
        )}
      </Panel>
    </div>
  )
}
