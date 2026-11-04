import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CheckCheckIcon, MessageSquareReplyIcon, SendIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { FeedbackKind, FeedbackMessage } from "@/api/types"
import { ErrorBox, Field, Loading } from "@/components/form"
import { Panel } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { dateTime } from "@/lib/time"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/help")({ component: Help })

const PLACEHOLDER: Record<FeedbackKind["key"], string> = {
  feedback: "What do you like, and what gets in your way?",
  feature: "What would you like Bangkee to do?",
  support: "What went wrong? Which screen were you on?",
}

// Profile → Help & feedback: tell Bangkee something, ask for a feature, or
// get help — and read the answers here.
function Help() {
  usePage("Help & feedback", "/settings", { narrow: true })
  const { data } = useQuery({ queryKey: ["feedback"], queryFn: api.myFeedback })
  const [kind, setKind] = useState<FeedbackKind["key"]>("feedback")
  const [body, setBody] = useState("")

  const send = useMutation({
    mutationFn: () => api.sendFeedback(kind, body),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      setBody("")
      await refreshAll()
    },
  })

  if (!data) return <Loading />

  return (
    <div className="grid gap-6">
      <Panel>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            send.mutate()
          }}
        >
          <ErrorBox errors={validationErrors(send.error)} />
          <div role="radiogroup" aria-label="What is it?" className="grid grid-cols-3 gap-1 rounded-full border bg-card p-1">
            {data.kinds.map((k) => (
              <button
                key={k.key}
                type="button"
                role="radio"
                aria-checked={kind === k.key}
                onClick={() => setKind(k.key)}
                className={cn("h-10 rounded-full px-2 text-sm font-medium transition-colors", kind === k.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                {k.key === "feature" ? "Feature" : k.label}
              </button>
            ))}
          </div>
          <Field label="Message" hint={`${body.trim().length}/2000`} htmlFor="feedback_body">
            <Textarea id="feedback_body" rows={5} maxLength={2000} placeholder={PLACEHOLDER[kind]} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" disabled={send.isPending || body.trim() === ""}>
            <SendIcon /> Send to Bangkee
          </Button>
        </form>
      </Panel>

      {data.messages.length > 0 && (
        <section className="grid gap-2.5">
          <h2 className="px-1 text-base font-semibold tracking-tight">What you have sent</h2>
          {data.messages.map((message) => (
            <Sent key={message.id} message={message} />
          ))}
        </section>
      )}
    </div>
  )
}

function Sent({ message }: { message: FeedbackMessage }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted">{message.kind_label}</Badge>
        <span className="text-xs text-muted-foreground">{dateTime(message.created_at)}</span>
        <span className="ml-auto">
          <StatusBadge status={message.status} />
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
      {message.reply && (
        <div className="mt-4 rounded-2xl bg-accent px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-foreground">
            <MessageSquareReplyIcon className="size-3.5" /> Bangkee replied {message.replied_at && `· ${dateTime(message.replied_at)}`}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{message.reply}</p>
        </div>
      )}
    </Panel>
  )
}

function StatusBadge({ status }: { status: FeedbackMessage["status"] }) {
  if (status === "replied") return <Badge variant="paid">Replied</Badge>
  if (status === "acknowledged")
    return (
      <Badge variant="brand">
        <CheckCheckIcon /> Seen
      </Badge>
    )
  return <Badge variant="muted">Sent</Badge>
}
