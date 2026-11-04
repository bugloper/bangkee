import { useMutation } from "@tanstack/react-query"
import { ArrowDownLeftIcon, ArrowUpRightIcon, BanIcon, ChevronDownIcon, PencilIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@/api/client"
import type { LedgerEntry } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { buttonVariants } from "@/components/ui/button"
import { Thumb } from "@/components/viewer"
import { confirm } from "@/lib/confirm"
import { flashNotice } from "@/lib/flash"
import { ngultrum, pluralize } from "@/lib/money"
import { refreshAll } from "@/lib/query"
import { dateTime } from "@/lib/time"
import { cn } from "@/lib/utils"

function titleize(kind: string) {
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

/** The round glyph that says which way the money went. */
function KindGlyph({ entry }: { entry: LedgerEntry }) {
  if (entry.voided) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <BanIcon className="size-4" />
      </span>
    )
  }
  const credit = entry.kind === "credit"
  const Icon = credit ? ArrowUpRightIcon : ArrowDownLeftIcon
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", credit ? "bg-owed/10 text-owed" : "bg-paid/10 text-paid")}>
      <Icon className="size-4" />
    </span>
  )
}

/** One entry in the book, as the account screen shows it. */
export function LedgerRow({ entry, owner, locked }: { entry: LedgerEntry; owner: boolean; locked: boolean }) {
  const [itemsOpen, setItemsOpen] = useState(false)
  const voidEntry = useMutation({
    mutationFn: () => api.voidTransaction(entry.id),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })

  const description = entry.description || (entry.kind === "payment" ? "Payment received" : "Goods on credit")

  async function onVoid() {
    const ok = await confirm(
      `Void this ${entry.kind}?|${entry.description || titleize(entry.kind)} · ${ngultrum(entry.amount_cents)}. ` +
        "It stays visible in the history, struck through, and no longer counts in the balance. " +
        "The void is written to the audit log, and cannot be undone.",
      { danger: true },
    )
    if (ok) voidEntry.mutate()
  }

  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        <KindGlyph entry={entry} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={cn("text-sm font-medium", entry.voided && "text-muted-foreground line-through decoration-muted-foreground/60")}>{description}</div>
              <div className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                {entry.voided && <span className="mr-1.5 inline-flex rounded bg-muted px-1.5 py-px text-[0.625rem] font-semibold tracking-wide uppercase">Voided</span>}
                {dateTime(entry.occurred_at)} · by {entry.created_by_name}
                {entry.payment_method && ` · ${entry.payment_method}`}
              </div>
              {entry.notes && <div className="mt-1 text-[0.8125rem] text-muted-foreground">{entry.notes}</div>}
              {entry.screenshot_url && (
                <div className="mt-2">
                  <Thumb url={entry.screenshot_url} size={56} caption={`${ngultrum(entry.amount_cents)} · ${dateTime(entry.occurred_at)}`} label="View the photo of the payment" />
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className={cn("tabular text-[0.9375rem] font-semibold", entry.voided ? "text-muted-foreground line-through" : entry.kind === "credit" ? "text-owed" : "text-paid")}>
                {ngultrum(entry.signed_amount_cents, true)}
              </div>
              {!entry.voided && <div className="tabular mt-0.5 text-xs text-muted-foreground">Bal {ngultrum(entry.running_balance_cents)}</div>}
            </div>
          </div>

          {entry.itemized && entry.line_items.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-primary hover:underline"
                onClick={() => setItemsOpen(!itemsOpen)}
                aria-expanded={itemsOpen}
              >
                {pluralize(entry.line_items.length, "item")}
                <ChevronDownIcon className={cn("size-3.5 transition-transform", itemsOpen && "rotate-180")} />
              </button>
              {itemsOpen && (
                <div className="mt-2 divide-y rounded-lg border bg-muted/30 text-[0.8125rem]">
                  {entry.line_items.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2">
                      <span className="truncate">{item.name}</span>
                      <span className="tabular text-muted-foreground">
                        {item.quantity_label} × {ngultrum(item.unit_price_cents)}
                      </span>
                      <span className="tabular font-medium">{ngultrum(item.total_cents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {owner && !entry.voided && !locked && (
            <div className="mt-2.5 flex gap-1.5">
              <AppLink href={`/transactions/${entry.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <PencilIcon /> Edit
              </AppLink>
              <button type="button" onClick={onVoid} disabled={voidEntry.isPending} className={buttonVariants({ variant: "destructive", size: "sm" })}>
                <BanIcon /> Void
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
