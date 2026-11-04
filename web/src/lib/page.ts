import { useEffect } from "react"

import { createStore } from "@/lib/store"

export interface PageHeader {
  title?: string
  back?: string
  /** The 560px measure the form screens use (content--narrow). */
  narrow?: boolean
}

export const pageStore = createStore<PageHeader>({})

/**
 * The topbar's title and back link for this screen, and the document title.
 * In standalone mode there is no browser toolbar, so every nested screen
 * carries its own back affordance.
 */
export function usePage(title: string | undefined, back?: string, options: { narrow?: boolean } = {}) {
  const narrow = options.narrow ?? false
  useEffect(() => {
    pageStore.set({ title, back, narrow })
    document.title = title ? `${title} · Bangkee` : "Bangkee — the shared credit book for your shop"
  }, [title, back, narrow])
}
