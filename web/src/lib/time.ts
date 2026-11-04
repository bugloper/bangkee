// The strftime formats the Rails views used, rendered in the viewer's own
// time zone (Rails rendered UTC).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function parts(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value
  const hour = d.getHours()
  return {
    day: d.getDate(),
    month: MONTHS[d.getMonth()],
    year: d.getFullYear(),
    clock: `${hour % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`,
  }
}

/** %-d %b — "4 Oct" */
export const dayMonth = (v: string | Date) => {
  const p = parts(v)
  return `${p.day} ${p.month}`
}
/** %-d %b %Y — "4 Oct 2026" */
export const longDate = (v: string | Date) => {
  const p = parts(v)
  return `${p.day} ${p.month} ${p.year}`
}
/** %-d %b, %-l:%M %p — "4 Oct, 3:05 PM" */
export const dateTime = (v: string | Date) => {
  const p = parts(v)
  return `${p.day} ${p.month}, ${p.clock}`
}
/** %-d %b %Y, %-l:%M %p */
export const longDateTime = (v: string | Date) => {
  const p = parts(v)
  return `${p.day} ${p.month} ${p.year}, ${p.clock}`
}
/** %-l:%M %p — "3:05 PM" */
export const clock = (v: string | Date) => parts(v).clock

/** Rails' time_ago_in_words. */
export function timeAgoInWords(value: string | Date, now = new Date()): string {
  const from = typeof value === "string" ? new Date(value) : value
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000))
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return "less than a minute"
  if (minutes === 1) return "1 minute"
  if (minutes < 45) return `${minutes} minutes`
  if (minutes < 90) return "about 1 hour"
  if (minutes < 1440) return `about ${Math.round(minutes / 60)} hours`
  if (minutes < 2520) return "1 day"
  if (minutes < 43200) return `${Math.round(minutes / 1440)} days`
  if (minutes < 86400) return `about ${Math.round(minutes / 43200)} month${Math.round(minutes / 43200) === 1 ? "" : "s"}`
  if (minutes < 525600) return `${Math.round(minutes / 43200)} months`
  const years = Math.floor(minutes / 525600)
  return years === 1 ? "about 1 year" : `over ${years} years`
}

/** A timestamp as <input type="datetime-local"> wants it, in local time. */
export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return ""
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A datetime-local value (local time, no zone) as an ISO instant for the server. */
export function fromDatetimeLocal(value: string): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}
