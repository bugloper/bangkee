import { BellRingIcon, DownloadIcon, ShareIcon, XIcon } from "lucide-react"

import type { Me } from "@/api/types"
import { ActionSheet } from "@/components/action-sheet"
import { LogoMark } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { dismissInstall, dismissPush, enablePush, install, installStore, iosSheetStore, pushPromptStore } from "@/lib/pwa"

/** Revealed when the browser offers installation. iOS never does, so it gets its own instruction. */
export function InstallCard() {
  const { available } = installStore.use()
  if (!available) return null
  return (
    <div className="no-print flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-xs">
      <LogoMark className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Install Bangkee</div>
        <div className="text-[0.8125rem] text-muted-foreground">
          Keep it on your home screen — it opens faster and works offline ·{" "}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => iosSheetStore.set(true)}>
            on iPhone?
          </button>
        </div>
      </div>
      <Button size="sm" onClick={install}>
        <DownloadIcon /> Install
      </Button>
      <button type="button" onClick={dismissInstall} aria-label="Not now" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <XIcon className="size-4" />
      </button>
    </div>
  )
}

const STEPS = [
  <>
    In Safari, tap the <strong>Share</strong> button <ShareIcon className="inline size-4 align-text-bottom" />
  </>,
  <>
    Scroll down and choose <strong>Add to Home Screen</strong>
  </>,
  <>
    Open <strong>Bangkee</strong> from your home screen — it runs full-screen, works offline, and can send you notifications
  </>,
]

/** iOS never fires beforeinstallprompt; the only path is Safari's Share menu, which has to be explained. */
export function IosInstallSheet() {
  const open = iosSheetStore.use()
  return (
    <ActionSheet open={open} onOpenChange={(next) => iosSheetStore.set(next)} title="Add Bangkee to your iPhone" label="Add Bangkee to your iPhone">
      <ol className="mb-5 grid gap-3">
        {STEPS.map((step, index) => (
          <li key={index} className="flex gap-3 text-sm leading-relaxed">
            <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <Button size="lg" className="w-full" onClick={() => iosSheetStore.set(false)}>
        Got it
      </Button>
    </ActionSheet>
  )
}

/** Shown after a write, never on arrival, and only while the browser has not been asked yet. */
export function PushPrompt({ me }: { me: Me }) {
  const open = pushPromptStore.use()
  const owner = me.user.role === "shop_owner" || me.user.role === "staff"
  return (
    <ActionSheet
      open={open}
      onOpenChange={(next) => !next && dismissPush()}
      icon={BellRingIcon}
      label="Turn on notifications"
      title={owner ? "Know the moment a customer pays" : "Know when your balance changes"}
      description={
        <>
          {owner
            ? "Bangkee can tell you about payments and overdue balances."
            : "Bangkee can tell you when the shop adds something to your book or confirms a payment."}{" "}
          Your browser will ask for permission next.
        </>
      }
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" onClick={dismissPush}>
          Not now
        </Button>
        <Button size="lg" onClick={enablePush}>
          Turn on notifications
        </Button>
      </div>
    </ActionSheet>
  )
}
