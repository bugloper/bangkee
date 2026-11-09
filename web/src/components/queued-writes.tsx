import { CloudOffIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { AppLink } from "@/components/app-link"
import { Count, Panel } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { confirm } from "@/lib/confirm"
import { majorAmount } from "@/lib/money"
import { flush, remove } from "@/lib/offline-queue"
import { refreshAll } from "@/lib/query"
import { dateTime } from "@/lib/time"
import { useQueue } from "@/lib/use-queue"
import { cn } from "@/lib/utils"

/**
 * Entries recorded with no signal. They exist only in this browser's
 * IndexedDB until they send, so the list is rendered from the device, not
 * fetched.
 */
export function QueuedWrites({ queueKey, caption }: { queueKey: string; caption?: string }) {
  const entries = useQueue(queueKey)
  if (entries.length === 0) return null

  async function retry() {
    if (!navigator.onLine) return toast("Still offline — the entries stay safe on this phone.")
    const { sent, failed } = await flush()
    if (sent > 0) {
      toast(`${sent} ${sent === 1 ? "entry" : "entries"} sent. Reloading the book.`)
      await refreshAll()
    } else if (failed > 0) {
      toast("The shop's server refused those entries — re-enter them to fix the details.")
    } else {
      toast("Nothing could be sent yet. Bangkee will keep trying.")
    }
  }

  async function discard(key: string) {
    if (await confirm("Discard this queued entry?|It will never reach the book.", { danger: true })) await remove(key)
  }

  return (
    <Panel
      flush
      className="border-warn/40"
      title={
        <span className="flex items-center gap-2">
          <CloudOffIcon className="size-4 text-warn" /> Waiting to send <Count>{entries.length}</Count>
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-muted-foreground">{caption ?? "These are on this phone only — they reach the book, and the customer, once you are back online."}</span>
          <Button variant="outline" size="sm" onClick={retry}>
            <RefreshCwIcon /> Try sending now
          </Button>
        </div>
      }
    >
      <div className="divide-y">
        {entries.map((entry) => {
          const amount = Number(String(entry.amount).replace(/,/g, ""))
          const money = Number.isNaN(amount) ? entry.amount : majorAmount(amount)
          return (
            <div key={entry.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className={cn("rounded px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase", entry.label.includes("payment") ? "bg-paid/10 text-paid" : "bg-owed/10 text-owed")}>
                {entry.label}
              </span>
              <div className="min-w-0 flex-1">
                <div className="tabular truncate text-sm font-medium">
                  {money}
                  {entry.description ? ` · ${entry.description}` : ""}
                </div>
                {entry.rejected ? (
                  <div className="text-[0.8125rem] text-owed">The shop's server refused this — open it again to re-enter it.</div>
                ) : (
                  <div className="text-[0.8125rem] text-muted-foreground">Queued {dateTime(new Date(entry.queuedAt))} — sends when you are back online</div>
                )}
              </div>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => discard(entry.key)}>
                Discard
              </Button>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/**
 * The whole device's queue in one line, for the home screen: how many
 * entries are still waiting to send, and — so none is lost without anyone
 * noticing — which the server refused, with a link to each customer.
 */
export function QueueSummary() {
  const entries = useQueue("")
  if (entries.length === 0) return null
  const refused = entries.filter((entry) => entry.rejected)
  const waiting = entries.length - refused.length
  const screens = [...new Set(refused.map((entry) => entry.queueKey))].filter((key) => key.startsWith("account:") || key.startsWith("supplier:"))
  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[1.25rem] border px-4 py-3 text-sm sm:px-5", refused.length > 0 ? "border-owed/40 bg-owed/5" : "border-warn/40 bg-warn/5")}
    >
      <CloudOffIcon className={cn("size-4 shrink-0", refused.length > 0 ? "text-owed" : "text-warn")} />
      <span className="min-w-0 flex-1">
        {waiting > 0 && `${waiting} ${waiting === 1 ? "entry is" : "entries are"} on this phone, waiting to send. `}
        {refused.length > 0 && `${refused.length} ${refused.length === 1 ? "was" : "were"} refused and need re-entering: `}
        {screens.map((key, i) => (
          <span key={key}>
            {i > 0 && ", "}
            <AppLink
              href={key.startsWith("supplier:") ? `/suppliers/${key.slice("supplier:".length)}` : `/accounts/${key.slice("account:".length)}`}
              className="font-medium text-primary hover:underline"
            >
              {key.startsWith("supplier:") ? "open supplier" : "open customer"}
            </AppLink>
          </span>
        ))}
      </span>
    </div>
  )
}
