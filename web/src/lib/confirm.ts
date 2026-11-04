// Turbo's confirm, rendered as the design's bottom sheet instead of
// window.confirm — voiding a transaction deserves a sentence of explanation.
// Messages keep the Rails "Title|Body" form.

import { createStore } from "@/lib/store"

export interface ConfirmRequest {
  title: string
  body: string
  danger: boolean
  resolve: (ok: boolean) => void
}

export const confirmStore = createStore<ConfirmRequest | null>(null)

export function confirm(message: string, options: { danger?: boolean } = {}): Promise<boolean> {
  const [title, body] = message.includes("|") ? message.split("|") : ["Are you sure?", message]
  return new Promise((resolve) => {
    confirmStore.set({ title, body, danger: options.danger ?? false, resolve })
  })
}
