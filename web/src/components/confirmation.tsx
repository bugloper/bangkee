import { useMutation } from "@tanstack/react-query"
import { CheckIcon, ClockIcon, FlagIcon, MessageSquareReplyIcon, ShieldAlertIcon } from "lucide-react"
import { useState } from "react"

import { api, ApiError } from "@/api/client"
import type { EntryResponse, LedgerEntry } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { flashNotice } from "@/lib/flash"
import { useCan } from "@/lib/me"
import { refreshAll } from "@/lib/query"
import { dateTime } from "@/lib/time"

// The customer's word on one entry: a badge for its state, the buttons to
// give it (customer) or answer it (shop), and what has been said so far.
// None of it changes the balance.

const SAID: Record<EntryResponse["action"], string> = { confirmed: "confirmed it", disputed: "flagged it", shop_replied: "replied", changed: "changed the entry" }

export function ConfirmationBadge({ entry, owner }: { entry: LedgerEntry; owner: boolean }) {
  if (entry.crossed_out) return null
  switch (entry.confirmation) {
    case "confirmed":
      return (
        <Badge variant="paid">
          <CheckIcon /> Confirmed
        </Badge>
      )
    case "disputed":
      return (
        <Badge variant="owed">
          <ShieldAlertIcon /> Flagged
        </Badge>
      )
    default:
      return (
        <Badge variant="muted">
          <ClockIcon /> {owner ? "Not confirmed yet" : "Please check"}
        </Badge>
      )
  }
}

/** The actions and the history under an entry. `joined`: the account has a customer who can answer. */
export function ConfirmationPanel({ entry, owner, joined }: { entry: LedgerEntry; owner: boolean; joined: boolean }) {
  const [writing, setWriting] = useState(false)
  const canManage = useCan("manage")
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const done = async (result: { notice?: string }) => {
    flashNotice(result.notice)
    setWriting(false)
    setText("")
    setError(null)
    await refreshAll()
  }
  const failed = (e: unknown) => setError(e instanceof ApiError ? e.message : "That did not go through. Try again.")
  const confirmIt = useMutation({ mutationFn: () => api.confirmEntry(entry.id), onSuccess: done, onError: failed })
  const send = useMutation({ mutationFn: () => (owner ? api.replyToDispute(entry.id, text) : api.disputeEntry(entry.id, text)), onSuccess: done, onError: failed })
  if (entry.crossed_out || !joined) return null
  // The shop has nothing to do or read on an entry nobody has answered.
  if (owner && entry.confirmation !== "disputed" && entry.responses.length === 0) return null

  const canAnswer = owner ? entry.confirmation === "disputed" && canManage : true
  const lastDispute = [...entry.responses].reverse().find((r) => r.action === "disputed")

  return (
    <div className="mt-2.5 grid gap-2">
      {owner && entry.confirmation === "disputed" && lastDispute && (
        <div className="rounded-lg border border-owed/30 bg-owed/5 px-3 py-2 text-[0.8125rem]">
          <span className="font-medium">The customer says:</span> {lastDispute.note}
          <div className="mt-1 text-xs text-muted-foreground">Fix it with Edit or Cross out, or reply if the entry is right.</div>
        </div>
      )}

      {canAnswer && !writing && (
        <div className="flex flex-wrap gap-1.5">
          {!owner && entry.confirmation !== "confirmed" && (
            <Button size="sm" variant="payment" disabled={confirmIt.isPending} onClick={() => confirmIt.mutate()}>
              <CheckIcon /> {entry.confirmation === "disputed" ? "It's right after all" : "Confirm"}
            </Button>
          )}
          {!owner && entry.confirmation !== "disputed" && (
            <Button size="sm" variant="outline" onClick={() => setWriting(true)}>
              <FlagIcon /> Something's wrong
            </Button>
          )}
          {owner && (
            <Button size="sm" variant="outline" onClick={() => setWriting(true)}>
              <MessageSquareReplyIcon /> Reply
            </Button>
          )}
        </div>
      )}

      {writing && (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            send.mutate()
          }}
        >
          <Textarea
            autoFocus
            rows={2}
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={owner ? "Explain the entry to the customer" : "What is wrong? e.g. I took one bag, not two"}
            aria-label={owner ? "Reply to the customer" : "What is wrong with this entry"}
          />
          <div className="flex gap-1.5">
            <Button size="sm" type="submit" disabled={send.isPending || !text.trim()}>
              {owner ? "Send reply" : "Flag this entry"}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setWriting(false)}>
              Cancel
            </Button>
          </div>
          {!owner && <p className="text-xs text-muted-foreground">The shop is told. Your balance stays as it is until the shop changes the entry.</p>}
        </form>
      )}
      {error && <p className="text-[0.8125rem] text-destructive">{error}</p>}

      {entry.responses.length > 0 && (
        <details className="text-[0.8125rem] text-muted-foreground">
          <summary className="cursor-pointer select-none">History</summary>
          <ul className="mt-1.5 grid gap-1 border-l pl-3">
            {entry.responses.map((r, i) => (
              <li key={i}>
                <span className="text-foreground">{r.by}</span> {SAID[r.action]}
                {r.note && <>: “{r.note}”</>} · {dateTime(r.at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
