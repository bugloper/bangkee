// Rails' flash: a notice or an alert set by one action and shown on the
// screen that follows. A message set just before a navigation is shown on
// the screen it lands on; one set without a navigation is shown where it
// was set. Either way the next navigation after that clears it.

import { createStore } from "@/lib/store"

export interface Flash {
  notice?: string
  alert?: string
  /** When it was set, to tell a redirect's arrival from a later tap. */
  at?: number
  /** The path it has been displayed on. */
  shownAt?: string
}

/** A navigation this soon after the flash was set is the redirect that carries it. */
const REDIRECT_WINDOW_MS = 1500

export const flashStore = createStore<Flash>({})

export function flashNotice(notice: string | undefined | null) {
  if (notice) flashStore.set({ notice, at: Date.now() })
}

export function flashAlert(alert: string | undefined | null) {
  if (alert) flashStore.set({ alert, at: Date.now() })
}

/** Called on every location change. */
export function settleFlash(pathname: string) {
  const flash = flashStore.get()
  if (!flash.notice && !flash.alert) return
  if (flash.shownAt) {
    if (flash.shownAt !== pathname) flashStore.set({})
    return
  }
  if (Date.now() - (flash.at ?? 0) < REDIRECT_WINDOW_MS) flashStore.set({ ...flash, shownAt: pathname })
  else flashStore.set({})
}
