import { TriangleAlertIcon } from "lucide-react"

import { ActionSheet } from "@/components/action-sheet"
import { Button } from "@/components/ui/button"
import { confirmStore } from "@/lib/confirm"

/** Renders whatever confirm() is currently asking. */
export function ConfirmHost() {
  const request = confirmStore.use()
  const finish = (ok: boolean) => {
    request?.resolve(ok)
    confirmStore.set(null)
  }
  return (
    <ActionSheet
      open={!!request}
      onOpenChange={(open) => !open && finish(false)}
      title={request?.title}
      description={request?.body}
      icon={request?.danger ? TriangleAlertIcon : undefined}
      tone={request?.danger ? "danger" : "brand"}
      label={request?.title}
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" onClick={() => finish(false)}>
          Cancel
        </Button>
        <Button
          size="lg"
          className={request?.danger ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
          onClick={() => finish(true)}
          autoFocus
        >
          Yes, continue
        </Button>
      </div>
    </ActionSheet>
  )
}
