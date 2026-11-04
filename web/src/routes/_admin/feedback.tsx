import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CheckIcon, InboxIcon, MailIcon, MessageSquareReplyIcon, PhoneIcon, StoreIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { AdminFeedbackQueue } from "@/api/types"
import { ErrorBox, Loading } from "@/components/form"
import { Empty, FilterTabs, Initial, Panel } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { validationErrors } from "@/lib/errors"
import { filterTab } from "@/lib/filter-tab"
import { flashNotice } from "@/lib/flash"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { dateTime, dayMonth } from "@/lib/time"

type Search = { status?: string }

export const Route = createFileRoute("/_admin/feedback")({
  validateSearch: (search: Record<string, unknown>): Search => ({ status: typeof search.status === "string" ? search.status : undefined }),
  component: FeedbackQueue,
})

const STATUSES: [string, string][] = [
  ["New", "new"],
  ["Acknowledged", "acknowledged"],
  ["Replied", "replied"],
  ["All", "all"],
]

type Message = AdminFeedbackQueue["messages"][number]

// The operator's inbox: feedback, feature requests and support from shop
// owners and customers. Acknowledge to say it was seen; reply to answer.
function FeedbackQueue() {
  usePage("Feedback")
  const status = Route.useSearch().status ?? "new"
  const { data } = useQuery({ queryKey: ["admin", "feedback", status], queryFn: () => api.adminFeedback(status) })

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <FilterTabs label="Filter by status">
        {STATUSES.map(([label, value]) => (
          <Link key={value} to="/feedback" search={{ status: value }} className={filterTab(status === value)}>
            {label}
            {value === "new" && data && data.new_count > 0 && <span className="tabular ml-1.5 opacity-70">{data.new_count}</span>}
          </Link>
        ))}
      </FilterTabs>
      {!data ? (
        <Loading />
      ) : data.messages.length > 0 ? (
        data.messages.map((message) => <Review key={message.id} message={message} />)
      ) : (
        <Panel>
          <Empty icon={InboxIcon} title={status === "new" ? "Nothing new" : "Nothing here"}>
            Feedback, feature requests and support from shops and customers land here.
          </Empty>
        </Panel>
      )}
    </div>
  )
}

function Review({ message }: { message: Message }) {
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState("")
  const done = async (result: { notice: string }) => {
    flashNotice(result.notice)
    setReplying(false)
    await refreshAll()
  }
  const acknowledge = useMutation({ mutationFn: () => api.acknowledgeFeedback(message.id), onSuccess: done })
  const answer = useMutation({ mutationFn: () => api.replyToFeedback(message.id, reply), onSuccess: done })
  const { from } = message

  return (
    <Panel>
      <div className="flex items-start gap-3">
        <Initial text={from.name} tone={from.role === "shop_owner" ? "brand" : "muted"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{from.name}</span>
            <Badge variant={message.kind === "support" ? "warn" : message.kind === "feature" ? "brand" : "muted"}>{message.kind_label}</Badge>
            <span className="text-xs text-muted-foreground">{dateTime(message.created_at)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.8125rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <StoreIcon className="size-3.5" />
              {from.shop ? `Owner of ${from.shop}` : "Customer"}
            </span>
            {from.email && (
              <a href={`mailto:${from.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <MailIcon className="size-3.5" /> {from.email}
              </a>
            )}
            {from.phone && (
              <a href={`tel:${from.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <PhoneIcon className="size-3.5" /> {from.phone}
              </a>
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-[0.9375rem] leading-relaxed whitespace-pre-wrap">{message.body}</p>

      {message.reply ? (
        <div className="mt-4 rounded-2xl bg-accent px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-foreground">
            <MessageSquareReplyIcon className="size-3.5" /> Replied
            {message.reviewed_by_name && ` by ${message.reviewed_by_name}`}
            {message.replied_at && ` · ${dayMonth(message.replied_at)}`}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{message.reply}</p>
        </div>
      ) : replying ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            answer.mutate()
          }}
        >
          <ErrorBox errors={validationErrors(answer.error)} />
          <Textarea
            aria-label={`Reply to ${from.name}`}
            rows={4}
            maxLength={2000}
            autoFocus
            placeholder={`They will see this on their Help & feedback page.`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setReplying(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={answer.isPending || reply.trim() === ""}>
              Send reply
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {message.status === "new" ? (
            <Button variant="outline" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate()}>
              <CheckIcon /> Acknowledge
            </Button>
          ) : (
            <span className="text-[0.8125rem] text-muted-foreground">
              Seen{message.reviewed_by_name && ` by ${message.reviewed_by_name}`}
              {message.acknowledged_at && ` · ${dayMonth(message.acknowledged_at)}`}
            </span>
          )}
          <Button onClick={() => setReplying(true)}>
            <MessageSquareReplyIcon /> Reply
          </Button>
        </div>
      )}
    </Panel>
  )
}
