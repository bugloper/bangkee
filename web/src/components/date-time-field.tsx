import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { ActionSheet } from "@/components/action-sheet"
import { Button } from "@/components/ui/button"
import { toDatetimeLocal } from "@/lib/time"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "Wed 5 Nov · 12:37 PM", or "Today · …" / "Yesterday · …" when it is. */
function whenLabel(d: Date, now: Date): string {
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const day = sameDay(d, now) ? "Today" : sameDay(d, yesterday) ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
  return `${day} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
}

/**
 * When something happened, for a credit or a payment. Blank means now —
 * almost always the case — so the field says "Now" until someone changes it.
 * Changing it opens a sheet: a month to tap a day in, and the time. Nothing
 * in the future: an entry records what has already happened.
 *
 * The value is what <input type="datetime-local"> would hold ("2026-11-05T12:37"), or "".
 */
export function DateTimeField({ id, value, onChange, allowNow = true }: { id?: string; value: string; onChange: (value: string) => void; allowNow?: boolean }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => new Date())
  const [month, setMonth] = useState(() => new Date())
  // The moment the sheet opened: what "today" and "the future" are measured from.
  const [now, setNow] = useState(() => new Date())
  const current = value ? new Date(value) : null

  const start = () => {
    const at = new Date()
    const from = current ?? at
    setNow(at)
    setDraft(from)
    setMonth(new Date(from.getFullYear(), from.getMonth(), 1))
    setOpen(true)
  }
  const done = (when: Date | null) => {
    if (!when) onChange("")
    else onChange(toDatetimeLocal((when > new Date() ? new Date() : when).toISOString()))
    setOpen(false)
  }

  return (
    <>
      <div className="relative">
        <button
          id={id}
          type="button"
          onClick={start}
          className="flex h-12 w-full items-center gap-3 rounded-2xl border bg-card px-4 text-left text-[0.9375rem] transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <CalendarIcon className="size-[1.125rem] text-muted-foreground" />
          <span className="flex-1 font-medium">{current ? whenLabel(current, now) : "Now"}</span>
          {!current && <span className="text-sm font-medium text-primary">Change</span>}
        </button>
        {current && allowNow && (
          <button
            type="button"
            aria-label="Back to now"
            onClick={() => onChange("")}
            className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      <ActionSheet open={open} onOpenChange={setOpen} title="When was it?" label="Choose the date and time">
        <Picker today={now} draft={draft} setDraft={setDraft} month={month} setMonth={setMonth} />
        <div className={cn("mt-5 grid gap-2", allowNow && "grid-cols-[auto_1fr]")}>
          {allowNow && (
            <Button type="button" variant="outline" size="lg" onClick={() => done(null)}>
              Now
            </Button>
          )}
          <Button type="button" size="lg" onClick={() => done(draft)}>
            Done
          </Button>
        </div>
      </ActionSheet>
    </>
  )
}

function Picker({ today, draft, setDraft, month, setMonth }: { today: Date; draft: Date; setDraft: (d: Date) => void; month: Date; setMonth: (d: Date) => void }) {
  const atThisMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth()
  const lead = month.getDay()
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()

  const pickDay = (day: number) => {
    const next = new Date(draft)
    next.setFullYear(month.getFullYear(), month.getMonth(), day)
    setDraft(next)
  }
  const shiftMonth = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1))
  const shiftTime = (minutes: number) => setDraft(new Date(draft.getTime() + minutes * 60_000))
  const pm = draft.getHours() >= 12
  const setHalf = (toPm: boolean) => {
    if (toPm !== pm) shiftTime(toPm ? 12 * 60 : -12 * 60)
  }
  const hour12 = draft.getHours() % 12 || 12

  return (
    <div className="grid min-w-0 gap-5">
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[0.9375rem] font-semibold">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
          <div className="flex gap-1.5">
            <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="flex size-9 items-center justify-center rounded-full border bg-card hover:bg-muted">
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              disabled={atThisMonth}
              onClick={() => shiftMonth(1)}
              className="flex size-9 items-center justify-center rounded-full border bg-card hover:bg-muted disabled:opacity-30"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div role="grid" className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1
            const date = new Date(month.getFullYear(), month.getMonth(), day)
            const future = date > today && !sameDay(date, today)
            const chosen = sameDay(date, draft)
            return (
              <div key={day} className="flex justify-center">
                <button
                  type="button"
                  disabled={future}
                  aria-pressed={chosen}
                  aria-label={date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  onClick={() => pickDay(day)}
                  className={cn(
                    "tabular flex size-10 items-center justify-center rounded-full text-sm font-medium transition-colors disabled:text-muted-foreground/35",
                    chosen ? "bg-foreground text-background" : sameDay(date, today) ? "text-primary ring-1 ring-primary/40" : "hover:bg-muted",
                  )}
                >
                  {day}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 rounded-2xl border p-1.5">
        <Stepper label="Hour" value={String(hour12)} onLess={() => shiftTime(-60)} onMore={() => shiftTime(60)} />
        <span className="text-lg font-semibold text-muted-foreground">:</span>
        <Stepper label="Minute" value={String(draft.getMinutes()).padStart(2, "0")} onLess={() => shiftTime(-5)} onMore={() => shiftTime(5)} />
        <div role="radiogroup" aria-label="AM or PM" className="flex rounded-full bg-muted p-0.5">
          {[false, true].map((half) => (
            <button
              key={String(half)}
              type="button"
              role="radio"
              aria-checked={pm === half}
              onClick={() => setHalf(half)}
              className={cn("h-9 rounded-full px-2.5 text-sm font-semibold transition-colors", pm === half ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {half ? "PM" : "AM"}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stepper({ label, value, onLess, onMore }: { label: string; value: string; onLess: () => void; onMore: () => void }) {
  return (
    <div className="flex items-center" role="group" aria-label={label}>
      <button type="button" aria-label={`Earlier ${label.toLowerCase()}`} onClick={onLess} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
        <MinusIcon className="size-4" />
      </button>
      <span className="tabular w-7 text-center text-lg font-semibold">{value}</span>
      <button type="button" aria-label={`Later ${label.toLowerCase()}`} onClick={onMore} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
        <PlusIcon className="size-4" />
      </button>
    </div>
  )
}
