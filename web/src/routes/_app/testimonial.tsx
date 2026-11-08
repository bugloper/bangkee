import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { MessageSquareQuoteIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { MyTestimonial } from "@/api/types"
import { ErrorBox, Field, Loading } from "@/components/form"
import { Panel } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { useMe } from "@/lib/me"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"

export const Route = createFileRoute("/_app/testimonial")({ component: TestimonialScreen })

// Profile → Share your experience: a few words for the Bangkee homepage.
// Bangkee reads it before it appears, and again after any change.
function TestimonialScreen() {
  usePage("Share your experience", "/settings", { narrow: true })
  const { data } = useQuery({ queryKey: ["testimonial"], queryFn: api.myTestimonial })
  if (!data) return <Loading />
  return <TestimonialForm key={data.testimonial?.updated_at ?? "new"} mine={data.testimonial} />
}

const STATUS: Record<NonNullable<MyTestimonial["testimonial"]>["status"], { label: string; variant: "muted" | "paid" | "brand"; note: string }> = {
  pending: { label: "Waiting for review", variant: "muted", note: "Bangkee reads every one before it goes on the homepage." },
  approved: { label: "On the homepage", variant: "paid", note: "Thank you — it is on bangkee.bt now." },
  hidden: { label: "Not shown", variant: "brand", note: "Bangkee has not put this one on the homepage. You can change it and send it again." },
}

function TestimonialForm({ mine }: { mine: MyTestimonial["testimonial"] }) {
  const me = useMe()
  const [body, setBody] = useState(mine?.body ?? "")
  const done = async (result: { notice: string }) => {
    flashNotice(result.notice)
    await refreshAll()
  }
  const save = useMutation({ mutationFn: () => api.saveTestimonial(body), onSuccess: done })
  const remove = useMutation({ mutationFn: api.deleteTestimonial, onSuccess: done })
  const who = me?.shop ? `your name and ${me.shop.name}` : "your name"
  const status = mine ? STATUS[mine.status] : null
  const changed = body.trim() !== (mine?.body ?? "")

  return (
    <Panel>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <MessageSquareQuoteIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold tracking-tight">How has Bangkee helped you?</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">A sentence or two for other shops and customers to read on the Bangkee homepage.</p>
          </div>
        </div>
        {status && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-sm">
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-muted-foreground">{status.note}</span>
          </div>
        )}
        <ErrorBox errors={validationErrors(save.error)} />
        <Field label="In your words" hint={`${body.trim().length}/300`} htmlFor="testimonial_body">
          <Textarea
            id="testimonial_body"
            rows={4}
            maxLength={300}
            placeholder={me?.shop ? "I stopped flipping pages to find customers…" : "I can see what I owe at the shop from my phone…"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          Bangkee may show this on its homepage with {who}. You can change it or take it down here at any time; a change is read again before it appears.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {mine ? (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/5 hover:text-destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2Icon /> Take it down
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" disabled={save.isPending || !changed || body.trim().length === 0}>
            {mine ? "Save changes" : "Send to Bangkee"}
          </Button>
        </div>
      </form>
    </Panel>
  )
}
