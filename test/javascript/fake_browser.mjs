// Just enough browser for offline_queue.js: an in-memory IndexedDB, the two
// globals it touches, and a fetch we can steer. Hand-rolled so the JS side
// needs no npm dependencies.

class FakeRequest {
  constructor() { this.result = undefined }
}

class FakeStore {
  constructor(rows) { this.rows = rows }

  put(entry) { this.rows.set(entry.key, entry); return new FakeRequest() }
  delete(key) { this.rows.delete(key); return new FakeRequest() }

  getAll() {
    const request = new FakeRequest()
    request.result = [ ...this.rows.values() ]
    return request
  }
}

class FakeTransaction {
  constructor(rows) {
    this.store = new FakeStore(rows)
    this.oncomplete = null
    this.onerror = null
    // Fire on the next tick, the way a real transaction settles.
    queueMicrotask(() => this.oncomplete && this.oncomplete())
  }

  objectStore() { return this.store }
}

class FakeDatabase {
  constructor() { this.rows = new Map(); this.objectStoreNames = { contains: () => true } }
  transaction() { return new FakeTransaction(this.rows) }
  createObjectStore() {}
}

export function installFakeBrowser({ online = true } = {}) {
  const database = new FakeDatabase()
  const listeners = {}
  const calls = []

  globalThis.indexedDB = {
    open() {
      const request = { result: database, onsuccess: null, onerror: null, onupgradeneeded: null }
      queueMicrotask(() => request.onsuccess && request.onsuccess())
      return request
    }
  }

  // Node 22+ defines navigator as a getter-only global, so it has to be
  // redefined rather than assigned.
  let isOnline = online
  const syncRegistrations = []
  const serviceWorker = {
    ready: Promise.resolve({ sync: { register: (tag) => { syncRegistrations.push(tag) } } })
  }

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    get: () => ({ onLine: isOnline, serviceWorker })
  })
  // The queue looks for SyncManager on the global to decide whether Background
  // Sync exists at all (Safari has none).
  globalThis.SyncManager = class {}

  globalThis.document = {
    dispatchEvent: () => true,
    addEventListener: (name, handler) => { listeners[name] = handler },
    querySelector: () => ({ content: "csrf-token" })
  }
  globalThis.window = {
    addEventListener: (name, handler) => { listeners[name] = handler }
  }
  globalThis.CustomEvent = class { constructor(name) { this.type = name } }
  globalThis.FormData = class {
    constructor() { this.entries = [] }
    append(name, value) { this.entries.push([ name, value ]) }
  }

  return {
    database,
    calls,
    syncRegistrations,
    withoutBackgroundSync(work) {
      const saved = globalThis.SyncManager
      delete globalThis.SyncManager
      return Promise.resolve(work()).finally(() => { globalThis.SyncManager = saved })
    },
    setOnline(value) { isOnline = value },
    // `responder` decides what the server says for each replayed entry.
    stubFetch(responder) {
      globalThis.fetch = async (url, options) => {
        calls.push({ url, fields: Object.fromEntries(options.body.entries) })
        return responder(calls.length, url, options)
      }
    }
  }
}

export const ok = () => ({ ok: true, redirected: false, status: 200 })
export const refused = (status = 422) => ({ ok: false, redirected: false, status })
export const unreachable = () => { throw new TypeError("Failed to fetch") }
