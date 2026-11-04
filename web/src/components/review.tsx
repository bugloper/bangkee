import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * The review actions: the approving button, and a "Reject…" toggle that
 * reveals a reason form — the reason is what the other side reads.
 */
export function ReviewActions({
  approve,
  toggleLabel,
  reasonLabel,
  reasonHint,
  placeholder,
  submitLabel,
  required = true,
  multiline = true,
  onReject,
  busy,
  className,
}: {
  approve: React.ReactNode
  toggleLabel: string
  reasonLabel: string
  reasonHint?: string
  placeholder: string
  submitLabel: string
  required?: boolean
  multiline?: boolean
  onReject: (reason: string) => void
  busy?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex flex-wrap gap-2">
        {approve}
        <Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>
          {toggleLabel}
        </Button>
      </div>
      {open && (
        <form
          className="grid gap-3 rounded-xl border bg-muted/30 p-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            onReject(reason)
          }}
        >
          <div className="grid gap-1.5">
            <Label>{reasonLabel}</Label>
            {reasonHint && <span className="text-xs text-muted-foreground">{reasonHint}</span>}
            {multiline ? (
              <Textarea rows={2} required={required} placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />
            ) : (
              <Input required={required} placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </div>
          <div>
            <Button type="submit" className="bg-destructive text-white hover:bg-destructive/90" disabled={busy}>
              {submitLabel}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
