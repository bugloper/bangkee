import { useEffect, useState } from "react"

import { forKey, QUEUE_CHANGED, type QueuedWrite } from "@/lib/offline-queue"

/** The entries waiting on this device for one screen, kept current as the queue changes. */
export function useQueue(queueKey: string) {
  const [entries, setEntries] = useState<QueuedWrite[]>([])
  useEffect(() => {
    let live = true
    const load = () => forKey(queueKey).then((list) => live && setEntries(list))
    load()
    window.addEventListener(QUEUE_CHANGED, load)
    return () => {
      live = false
      window.removeEventListener(QUEUE_CHANGED, load)
    }
  }, [queueKey])
  return entries
}
