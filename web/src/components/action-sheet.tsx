import type { LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const ARM_DELAY_MS = 500

/**
 * A question that needs an answer before anything moves: a bottom sheet on
 * a phone, where the thumb already is, and a centred dialog on a desk.
 */
export function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  tone = "brand",
  children,
  label,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  tone?: "brand" | "danger"
  children?: React.ReactNode
  label?: string
}) {
  // A sheet slides up under the thumb that opened it. Until it has settled,
  // a second tap (a double-tap, or a laggy screen counting one tap twice)
  // would land on whatever button is now there, recording a payment
  // nobody chose. So it takes no taps for its first moment.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => setArmed(true), ARM_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      setArmed(false)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label={label}
        showCloseButton={false}
        className={cn(
          "gap-0 p-0 sm:max-w-md",
          "max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:data-open:slide-in-from-bottom-8 max-sm:data-open:zoom-in-100",
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-muted sm:hidden" />
        <div className="px-5 pt-5 pb-1 sm:px-6 sm:pt-6">
          {Icon && (
            <span className={cn("mb-4 flex size-11 items-center justify-center rounded-xl", tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-accent text-primary")}>
              <Icon className="size-5" />
            </span>
          )}
          <DialogTitle className="text-lg leading-snug font-semibold tracking-tight">{title}</DialogTitle>
          {description && <DialogDescription className="mt-2 text-sm leading-relaxed">{description}</DialogDescription>}
        </div>
        <div className={cn("pb-safe px-5 pt-4 pb-5 sm:px-6 sm:pb-6", !armed && "pointer-events-none")}>{children}</div>
      </DialogContent>
    </Dialog>
  )
}
