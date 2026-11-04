/// <reference lib="webworker" />
// Bangkee service worker.
//
// Shop owners work on a bad connection, so screens and data are network-first
// with a cache fallback: fresh when there is signal, the last good copy when
// there is not, and the offline screen only when neither exists. The app
// shell itself is precached at install.

import { precacheAndRoute } from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"
import { NetworkFirst } from "workbox-strategies"

// The page and the worker share one tsconfig, where `self` is a Window.
declare global {
  interface Window {
    // Replaced at build time with the precache list; workbox looks for this exact text.
    __WB_MANIFEST: Array<{ url: string; revision: string | null }>
  }
}
const sw = self as unknown as ServiceWorkerGlobalScope

sw.addEventListener("install", () => void sw.skipWaiting())
sw.addEventListener("activate", (event) => event.waitUntil(sw.clients.claim()))

precacheAndRoute(self.__WB_MANIFEST)

// Navigations: the SPA's index.html, fetched fresh when possible.
const pages = new NetworkFirst({ cacheName: "bangkee-pages", networkTimeoutSeconds: 4 })
registerRoute(
  new NavigationRoute(async (options) => {
    try {
      return await pages.handle(options)
    } catch {
      return (await caches.match("/index.html")) ?? (await caches.match("/offline")) ?? Response.error()
    }
  }),
)

// API reads: the last answer is better than none when the signal is gone.
// Screenshots are left to the browser's own cache; writes always go to the
// network (and, when they cannot, to the queue below).
registerRoute(
  ({ url, request }) =>
    request.method === "GET" && url.origin === sw.location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/attachments/"),
  new NetworkFirst({ cacheName: "bangkee-api", networkTimeoutSeconds: 6 }),
)

// ---------------------------------------------------- queued writes (sync)
//
// The page replays the queue whenever it is open and the connection returns.
// This is the other half: the browser wakes the worker once there is a
// signal even if Bangkee has been closed since, so a credit written in a shop
// with no bars still reaches the book. Same database as src/lib/offline-queue.ts.

const QUEUE_DB = "bangkee"
const QUEUE_VERSION = 2
const QUEUE_STORE = "queued_writes"
const SYNC_TAG = "bangkee-queued-writes"

interface QueuedWrite {
  key: string
  method: string
  url: string
  body: unknown
  queuedAt: number
  rejected?: number
}

function queueDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, QUEUE_VERSION)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    // The page owns the schema; if this worker gets there first, match it.
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (event.oldVersion < 2 && db.objectStoreNames.contains(QUEUE_STORE)) db.deleteObjectStore(QUEUE_STORE)
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "key" })
    }
  })
}

function queueEntries(db: IDBDatabase): Promise<QueuedWrite[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE_STORE, "readonly").objectStore(QUEUE_STORE).getAll()
    request.onsuccess = () => resolve(((request.result as QueuedWrite[]) || []).sort((a, b) => a.queuedAt - b.queuedAt))
    request.onerror = () => reject(request.error)
  })
}

function writeEntry(db: IDBDatabase, action: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, "readwrite")
    action(transaction.objectStore(QUEUE_STORE))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

async function drainQueue() {
  const db = await queueDatabase()
  for (const entry of await queueEntries(db)) {
    if (entry.rejected) continue // already refused; the owner has to look at it

    // A network error rejects, so the browser retries the sync later.
    const response = await fetch(entry.url, {
      method: entry.method,
      credentials: "same-origin",
      headers: { "X-Requested-With": "bangkee", Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(entry.body),
    })

    if (response.ok) {
      await writeEntry(db, (store) => store.delete(entry.key))
    } else if (response.status === 401) {
      break // signed out; a page replays it after sign-in
    } else if (response.status >= 500) {
      throw new Error(`server error ${response.status}`)
    } else {
      // The server means it. Keep it, marked, for the owner to see.
      await writeEntry(db, (store) => store.put({ ...entry, rejected: response.status }))
    }
  }
}

sw.addEventListener("sync", (event) => {
  const sync = event as ExtendableEvent & { tag: string }
  if (sync.tag !== SYNC_TAG) return
  sync.waitUntil(drainQueue())
})

// ------------------------------------------------------------------- push
// A PWA cannot choose its own notification sound, so vibration is the one
// signal we can shape: money arriving feels different in the pocket.
const VIBRATION: Record<string, number[]> = {
  payment: [90, 60, 90, 60, 180], // money in — the one worth looking at
  overdue: [220], // one long buzz: attention, not good news
  default: [120, 70, 120],
}

sw.addEventListener("push", (event) => {
  let payload: { title?: string; body?: string; tag?: string; kind?: string; path?: string } = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-badge.png",
    tag: payload.tag || "bangkee",
    // Without this, a notification sharing a tag replaces the last one in
    // silence — two payments a minute apart would alert once.
    renotify: true,
    vibrate: VIBRATION[payload.kind ?? ""] || VIBRATION.default,
    data: { path: payload.path || "/" },
    requireInteraction: false,
  }
  event.waitUntil(sw.registration.showNotification(payload.title || "Bangkee", options))
})

sw.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const path = (event.notification.data && event.notification.data.path) || "/"
  event.waitUntil(
    sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === sw.location.origin && "focus" in client) {
          void (client as WindowClient).navigate(path)
          return (client as WindowClient).focus()
        }
      }
      return sw.clients.openWindow(path)
    }),
  )
})
