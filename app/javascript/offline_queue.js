// The queue behind "recorded with no signal".
//
// A shop owner will write in the book while the connection is gone, and losing
// that entry is not acceptable. Entries are kept in IndexedDB — not
// localStorage, because they must survive a crash mid-write and hold more than
// a page's worth — and replayed when the browser says it is online again.
//
// Credits, payments and rounds added to a tab are queued: each is small, has no
// file attachment, and carries an idempotency key so a replay cannot enter the
// same thing twice. Nothing with a photo attached is queued, and neither is
// opening or settling a tab — those are conversations with the server, not one
// POST that can be repeated.

const DB_NAME = "bangkee"
const DB_VERSION = 1
const STORE = "queued_writes"

export const QUEUE_CHANGED = "bangkee:queue-changed"
export const SYNC_TAG = "bangkee-queued-writes"

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, work) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const result = work(transaction.objectStore(STORE))
    transaction.oncomplete = () => resolve(result?.result ?? result)
    transaction.onerror = () => reject(transaction.error)
  })
}

function announce() {
  document.dispatchEvent(new CustomEvent(QUEUE_CHANGED))
}

// ---------------------------------------------------------------- public API

export function newKey() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function enqueue(entry) {
  // The token travels with the entry: the service worker has no DOM to read it
  // from when it drains the queue after the tab is gone.
  const stored = { csrfToken: csrfToken(), ...entry }
  await withStore("readwrite", (store) => store.put(stored))
  announce()
  await requestBackgroundSync()
  return stored
}

// Background Sync lets the browser replay the queue once the connection is
// back even if Bangkee has been closed since. Where it is unsupported (Safari,
// and therefore every iPhone) the page-side replay on `online` is the fallback.
export async function requestBackgroundSync() {
  if (!("serviceWorker" in navigator) || !("SyncManager" in globalThis)) return false

  try {
    const registration = await navigator.serviceWorker.ready
    await registration.sync.register(SYNC_TAG)
    return true
  } catch (error) {
    return false   // permission denied, or too many pending registrations
  }
}

async function put(entry) {
  await withStore("readwrite", (store) => store.put(entry))
  announce()
  return entry
}

export async function all() {
  try {
    const entries = await withStore("readonly", (store) => store.getAll())
    return (entries || []).sort((a, b) => a.queuedAt - b.queuedAt)
  } catch (error) {
    console.warn("[bangkee] could not read the offline queue", error)
    return []
  }
}

// Entries belonging to one screen — a customer's page, or one tab.
export async function forKey(queueKey) {
  return (await all()).filter((entry) => entry.queueKey === queueKey)
}

export async function remove(key) {
  await withStore("readwrite", (store) => store.delete(key))
  announce()
}

function csrfToken() {
  return document.querySelector("meta[name=csrf-token]")?.content
}

// Replays the queue oldest-first. Stops at the first network failure so
// entries keep their order; a rejection by the server (a 4xx that is not a
// timeout) drops the entry rather than retrying it forever.
export async function flush() {
  if (!navigator.onLine) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0

  for (const entry of await all()) {
    const body = new FormData()
    Object.entries(entry.fields).forEach(([name, value]) => body.append(name, value))

    let response
    try {
      response = await fetch(entry.url, {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: { "X-CSRF-Token": csrfToken(), "Accept": "text/html" },
        redirect: "follow"
      })
    } catch (error) {
      break   // still offline, or the request never left — try again later
    }

    if (response.ok || response.redirected) {
      await remove(entry.key)
      sent++
    } else if (response.status >= 400 && response.status < 500) {
      // The server refused it (write-locked, the account is gone, the session
      // expired). Keep it for the owner to see rather than replaying forever.
      // This runs in a page, so the token was current — the refusal is real.
      await put({ ...entry, rejected: response.status })
      failed++
    } else {
      break
    }
  }

  if (sent > 0) announce()
  return { sent, failed }
}

// Replay whenever the connection returns, and once on load in case the browser
// was closed while entries were still waiting.
window.addEventListener("online", () => flush())
document.addEventListener("turbo:load", () => flush(), { once: true })
