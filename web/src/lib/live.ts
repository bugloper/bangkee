// Live notifications: while Bangkee is open, a socket to /api/live hears each
// notification as it is written. The screen refreshes, Bangkee's chime plays
// and a toast offers to open it. When the tab is hidden the service worker's
// push notification does the telling instead, and the page only refreshes.

import { useEffect } from "react"
import { toast } from "sonner"

import { api } from "@/api/client"
import { go } from "@/lib/go"
import { refreshAll } from "@/lib/query"
import { chime, unlockSound } from "@/lib/sound"

type LiveNotification = { id: number; kind: string; title: string; body: string | null; path: string | null }

// The socket and the service worker can both hand over the same notification.
const seen = new Set<number>()

function heard(notification: LiveNotification) {
  void refreshAll()
  if (document.visibilityState !== "visible" || seen.has(notification.id)) return
  seen.add(notification.id)
  chime(notification.kind)
  toast(notification.title, {
    id: `notification-${notification.id}`,
    description: notification.body ?? undefined,
    action: notification.path ? { label: "Open", onClick: () => void openNotification(notification.id, notification.path) } : undefined,
  })
}

/** Marks it read and goes where it points, as the bell does. */
export async function openNotification(id: number, path: string | null) {
  try {
    path = (await api.readNotification(id)).path ?? path
  } catch {
    /* still go there */
  }
  go(path ?? "/notifications")
  await refreshAll()
}

function connect(): () => void {
  let socket: WebSocket | null = null
  let stopped = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const open = () => {
    socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live`)
    socket.onopen = () => {
      // Anything written while the socket was down is in the database.
      if (failures > 0) void refreshAll()
      failures = 0
    }
    socket.onmessage = (event) => {
      try {
        heard(JSON.parse(event.data as string) as LiveNotification)
      } catch {
        /* not ours */
      }
    }
    socket.onclose = () => {
      if (stopped) return
      failures++
      // 2s, 4s, 8s … up to half a minute between tries on a bad connection.
      timer = setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)))
    }
  }
  open()
  return () => {
    stopped = true
    clearTimeout(timer)
    socket?.close()
  }
}

// What the service worker hands the page: a push that arrived while Bangkee
// was on screen, or a tap on a push notification.
function onWorkerMessage(event: MessageEvent) {
  const data = event.data as { type?: string; notification?: LiveNotification; path?: string } | null
  if (data?.type === "notification" && data.notification) heard(data.notification)
  if (data?.type === "open" && data.path) {
    go(data.path)
    void refreshAll() // the worker marked it read
  }
}

/** Once per signed-in person, for as long as the shell is on screen. */
export function useLive(userId: number) {
  useEffect(() => {
    unlockSound()
    const disconnect = connect()
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage)
    return () => {
      disconnect()
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage)
    }
  }, [userId])
}
