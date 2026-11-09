// The queue behind "recorded with no signal".
//
// A shop owner will write in the book while the connection is gone, and
// losing that entry is not acceptable. Entries are kept in IndexedDB — not
// localStorage, because they must survive a crash mid-write and hold more
// than a page's worth — and replayed when the browser says it is online.
//
// Credits, payments (with or without a photo of the payment screen) and
// supplier entries are queued, each with an idempotency key so a replay cannot
// enter the same thing twice. A photo is kept as a Blob in the same record and
// sent as a multipart form when the entry replays.
//
// The service worker (src/service-worker.ts) drains the same store on a
// Background Sync event; keep the names in step.

import { openDB } from "idb"

import { API_HEADERS } from "@/api/client"

export const DB_NAME = "bangkee"
export const DB_VERSION = 2
export const STORE = "queued_writes"
export const SYNC_TAG = "bangkee-queued-writes"
export const QUEUE_CHANGED = "bangkee:queue-changed"

/** A file sent with the entry, as a form field. */
export interface QueuedFile {
  field: string
  blob: Blob
  name: string
}

export interface QueuedWrite {
  key: string
  method: "POST"
  url: string
  body: Record<string, unknown>
  /** Present when the entry carries a file: it replays as a multipart form. */
  files?: QueuedFile[]
  /** Which screen shows it while it waits: "account:12", "supplier:3". */
  queueKey: string
  label: "credit" | "payment" | "purchase" | "supplier payment" | "sale"
  amount: string
  description: string
  queuedAt: number
  /** The status the server refused it with; kept for the owner to see. */
  rejected?: number
}

function database() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Version 1 was the Rails app's form-field queue; its entries cannot be
      // replayed against the JSON API, so the store starts again.
      if (oldVersion < 2 && db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE)
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" })
    },
  })
}

function announce() {
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED))
}

export function newKey(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function all(): Promise<QueuedWrite[]> {
  try {
    const entries = (await (await database()).getAll(STORE)) as QueuedWrite[]
    return entries.sort((a, b) => a.queuedAt - b.queuedAt)
  } catch (error) {
    console.warn("[bangkee] could not read the offline queue", error)
    return []
  }
}

export async function forKey(queueKey: string) {
  return (await all()).filter((entry) => entry.queueKey === queueKey)
}

export async function remove(key: string) {
  await (await database()).delete(STORE, key)
  announce()
}

async function put(entry: QueuedWrite) {
  await (await database()).put(STORE, entry)
  announce()
}

// Background Sync lets the browser replay the queue once the connection is
// back even if Bangkee has been closed since. Where it is unsupported (Safari,
// and therefore every iPhone) the page-side replay on `online` is the fallback.
export async function requestBackgroundSync() {
  if (!("serviceWorker" in navigator) || !("SyncManager" in globalThis)) return false
  try {
    // ready never settles where no worker can run (a private window, a blocked
    // worker); the entry is already saved, so give up rather than hang the form.
    const ready = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))])
    if (!ready) return false
    const registration = ready as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }
    await registration.sync.register(SYNC_TAG)
    return true
  } catch {
    return false // permission denied, or too many pending registrations
  }
}

export async function enqueue(entry: Omit<QueuedWrite, "method" | "queuedAt">) {
  await put({ ...entry, method: "POST", queuedAt: Date.now() })
  await requestBackgroundSync()
}

/** The request body for an entry: JSON, or a form when it carries files. */
export function requestInit(entry: Pick<QueuedWrite, "body" | "files">): { body: BodyInit; headers: Record<string, string> } {
  if (!entry.files?.length) return { body: JSON.stringify(entry.body), headers: { "Content-Type": "application/json" } }
  const form = new FormData()
  for (const [name, value] of Object.entries(entry.body)) if (value !== undefined && value !== null) form.set(name, String(value))
  for (const file of entry.files) form.set(file.field, file.blob, file.name)
  return { body: form, headers: {} }
}

let flushing: Promise<{ sent: number; failed: number }> | null = null

// Replays the queue oldest-first. Stops at the first network failure so
// entries keep their order; a refusal by the server (a 4xx) is kept, marked,
// rather than replayed forever.
export function flush(): Promise<{ sent: number; failed: number }> {
  flushing ??= (async () => {
    let sent = 0
    let failed = 0
    if (!navigator.onLine) return { sent, failed }

    for (const entry of await all()) {
      if (entry.rejected) continue
      let response: Response
      try {
        const { body, headers } = requestInit(entry)
        response = await fetch(entry.url, { method: entry.method, credentials: "same-origin", headers: { ...API_HEADERS, ...headers }, body })
      } catch {
        break // still offline, or the request never left — try again later
      }
      if (response.ok) {
        await remove(entry.key)
        sent++
      } else if (response.status === 401) {
        break // signed out; replay once they sign back in
      } else if (response.status >= 400 && response.status < 500) {
        await put({ ...entry, rejected: response.status })
        failed++
      } else {
        break
      }
    }
    return { sent, failed }
  })().finally(() => {
    flushing = null
  })
  return flushing
}
