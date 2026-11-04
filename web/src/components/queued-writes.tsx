import { CloudOffIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

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
              <span className={cn("rounded px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase", entry.label === "payment" ? "bg-paid/10 text-paid" : "bg-owed/10 text-owed")}>{entry.label}</span>
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
