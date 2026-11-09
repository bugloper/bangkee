import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CheckIcon, EyeOffIcon, MailIcon, MessageSquareQuoteIcon, PhoneIcon, StoreIcon } from "lucide-react"

import { api } from "@/api/client"
import type { AdminTestimonialQueue } from "@/api/types"
import { Loading } from "@/components/form"
import { Empty, FilterTabs, Initial, Panel } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { filterTab } from "@/lib/filter-tab"
import { flashNotice } from "@/lib/flash"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"
import { dateTime } from "@/lib/time"

type Search = { status?: string }

export const Route = createFileRoute("/_admin/testimonials")({
  validateSearch: (search: Record<string, unknown>): Search => ({ status: typeof search.status === "string" ? search.status : undefined }),
  component: TestimonialQueue,
})

const STATUSES: [string, string][] = [
  ["Waiting", "pending"],
  ["On the homepage", "approved"],
  ["Hidden", "hidden"],
  ["All", "all"],
]

type Testimonial = AdminTestimonialQueue["testimonials"][number]

// What shop owners and customers wrote for the homepage. Nothing appears
// there until it is approved here; a change sends it back to Waiting.
function TestimonialQueue() {
  usePage("Testimonials")
  const status = Route.useSearch().status ?? "pending"
  const { data } = useQuery({ queryKey: ["admin", "testimonials", status], queryFn: () => api.adminTestimonials(status) })

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <FilterTabs label="Filter by status">
        {STATUSES.map(([label, value]) => (
          <Link key={value} to="/testimonials" search={{ status: value }} className={filterTab(status === value)}>
            {label}
            {value === "pending" && data && data.pending_count > 0 && <span className="tabular ml-1.5 opacity-70">{data.pending_count}</span>}
          </Link>
        ))}
      </FilterTabs>
      {!data ? (
        <Loading />
      ) : data.testimonials.length > 0 ? (
        data.testimonials.map((testimonial) => <Review key={testimonial.id} testimonial={testimonial} />)
      ) : (
        <Panel>
          <Empty icon={MessageSquareQuoteIcon} title={status === "pending" ? "Nothing waiting" : "Nothing here"}>
            Shop owners and customers write these from their Profile. Approve one and it appears on the homepage.
          </Empty>
        </Panel>
      )}
    </div>
  )
}

function Review({ testimonial }: { testimonial: Testimonial }) {
  const done = async (result: { notice: string }) => {
    flashNotice(result.notice)
    await refreshAll()
  }
  const approve = useMutation({ mutationFn: () => api.approveTestimonial(testimonial.id), onSuccess: done })
  const hide = useMutation({ mutationFn: () => api.hideTestimonial(testimonial.id), onSuccess: done })
  const { from } = testimonial
  const busy = approve.isPending || hide.isPending

  return (
    <Panel>
      <div className="flex items-start gap-3">
        <Initial text={from.name} tone={from.role === "shop_owner" ? "brand" : "muted"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{from.name}</span>
            {testimonial.status === "approved" ? (
              <Badge variant="paid">On the homepage</Badge>
            ) : testimonial.status === "hidden" ? (
              <Badge variant="muted">Hidden</Badge>
            ) : (
              <Badge variant="warn">Waiting</Badge>
            )}
            <span className="text-xs text-muted-foreground">{dateTime(testimonial.updated_at)}</span>
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

      <blockquote className="mt-4 border-l-2 border-primary/40 pl-4 text-[0.9375rem] leading-relaxed">“{testimonial.body}”</blockquote>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {testimonial.status !== "approved" && (
          <Button disabled={busy} onClick={() => approve.mutate()}>
            <CheckIcon /> Put on the homepage
          </Button>
        )}
        {testimonial.status !== "hidden" && (
          <Button variant="outline" disabled={busy} onClick={() => hide.mutate()}>
            <EyeOffIcon /> Hide
          </Button>
        )}
        {testimonial.reviewed_by_name && testimonial.reviewed_at && (
          <span className="text-[0.8125rem] text-muted-foreground">
            Reviewed by {testimonial.reviewed_by_name} · {dateTime(testimonial.reviewed_at)}
          </span>
        )}
      </div>
    </Panel>
  )
}
