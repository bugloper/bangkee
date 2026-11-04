import { ArrowDownLeftIcon, ArrowUpRightIcon, ChevronRightIcon, UserPlusIcon, type LucideIcon } from "lucide-react"

import { ActionSheet } from "@/components/action-sheet"
import { go } from "@/lib/go"
import { cn } from "@/lib/utils"

/**
 * What the round + offers: the three things a shop owner does all day. A
 * credit or a payment asks whose next; a new customer goes straight to the form.
 */
export function RecordSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const choose = (path: string) => {
    onOpenChange(false)
    go(path)
  }
  return (
    <ActionSheet open={open} onOpenChange={onOpenChange} title="Record" label="Record">
      <div className="grid gap-2">
        <Choice icon={ArrowUpRightIcon} tone="owed" title="Add credit" detail="Goods taken, to pay later" onClick={() => choose("/record?kind=credit")} />
        <Choice icon={ArrowDownLeftIcon} tone="paid" title="Record payment" detail="Money received, in cash or by transfer" onClick={() => choose("/record?kind=payment")} />
        <Choice icon={UserPlusIcon} tone="brand" title="Add customer" detail="Start someone's credit book" onClick={() => choose("/accounts/new")} />
      </div>
    </ActionSheet>
  )
}

function Choice({ icon: Icon, tone, title, detail, onClick }: { icon: LucideIcon; tone: "owed" | "paid" | "brand"; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-muted/60">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          tone === "owed" && "bg-owed/10 text-owed",
          tone === "paid" && "bg-paid/10 text-paid",
          tone === "brand" && "bg-accent text-primary",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold">{title}</span>
        <span className="block text-[0.8125rem] text-muted-foreground">{detail}</span>
      </span>
      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </button>
  )
}
