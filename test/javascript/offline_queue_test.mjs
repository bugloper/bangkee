// The client half of "recorded with no signal". The Ruby suite covers the
// server's idempotent replay; this covers the queue that does the replaying.
import { test } from "node:test"
import assert from "node:assert/strict"
import { installFakeBrowser, ok, refused, unreachable } from "./fake_browser.mjs"

const browser = installFakeBrowser()
const { enqueue, all, remove, flush, newKey, SYNC_TAG } = await import("../../app/javascript/offline_queue.js")

function entry(overrides = {}) {
  return {
    key: newKey(),
    url: "/accounts/1/credits",
    accountId: "1",
    label: "credit",
    amount: "1250",
    description: "Groceries",
    queuedAt: Date.now(),
    fields: { "transaction[amount]": "1250" },
    ...overrides
  }
}

async function reset() {
  for (const queued of await all()) await remove(queued.key)
  browser.calls.length = 0
  browser.syncRegistrations.length = 0
  browser.setOnline(true)
}

test("an entry survives being queued and read back", async () => {
  await reset()
  const queued = entry()
  await enqueue(queued)

  const stored = await all()
  assert.equal(stored.length, 1)
  assert.equal(stored[0].amount, "1250")
})

test("keys are unique so two entries never collide", async () => {
  await reset()
  await enqueue(entry())
  await enqueue(entry())
  assert.equal((await all()).length, 2)
})

test("the queue replays oldest first and empties on success", async () => {
  await reset()
  await enqueue(entry({ queuedAt: 2_000, fields: { order: "second" } }))
  await enqueue(entry({ queuedAt: 1_000, fields: { order: "first" } }))

  browser.stubFetch(ok)
  const result = await flush()

  assert.equal(result.sent, 2)
  assert.deepEqual(browser.calls.map((call) => call.fields.order), [ "first", "second" ])
  assert.equal((await all()).length, 0, "nothing is left behind")
})

test("nothing is sent while offline", async () => {
  await reset()
  await enqueue(entry())
  browser.setOnline(false)
  browser.stubFetch(ok)

  const result = await flush()
  assert.equal(result.sent, 0)
  assert.equal(browser.calls.length, 0)
  assert.equal((await all()).length, 1, "the entry is still waiting")
})

test("a request that never leaves stops the run and keeps the entry", async () => {
  await reset()
  await enqueue(entry())
  browser.stubFetch(unreachable)

  const result = await flush()
  assert.equal(result.sent, 0)
  assert.equal((await all()).length, 1)
})

test("a later entry is not sent ahead of one that failed to leave", async () => {
  await reset()
  await enqueue(entry({ queuedAt: 1_000 }))
  await enqueue(entry({ queuedAt: 2_000 }))
  browser.stubFetch(unreachable)

  await flush()
  assert.equal(browser.calls.length, 1, "the run stops at the first failure")
  assert.equal((await all()).length, 2)
})

test("an entry the server refuses is marked rather than replayed forever", async () => {
  await reset()
  await enqueue(entry())
  browser.stubFetch(() => refused(422))

  const result = await flush()
  assert.equal(result.failed, 1)

  const [ stored ] = await all()
  assert.equal(stored.rejected, 422, "kept, and marked for the owner to see")

  // A second run does not send it again and again.
  browser.calls.length = 0
  await flush()
  assert.equal(browser.calls.length, 1, "one further attempt at most per run")
})

test("every replay carries the CSRF token from the page it is sent from", async () => {
  await reset()
  await enqueue(entry())
  let headers
  globalThis.fetch = async (url, options) => { headers = options.headers; return ok() }

  await flush()
  assert.equal(headers["X-CSRF-Token"], "csrf-token")
})

test("queuing asks the browser to drain us in the background", async () => {
  await reset()
  await enqueue(entry())

  assert.deepEqual(browser.syncRegistrations, [ SYNC_TAG ])
})

test("queuing still works where Background Sync does not exist", async () => {
  await reset()

  await browser.withoutBackgroundSync(() => enqueue(entry()))

  assert.equal((await all()).length, 1, "the entry is queued regardless")
  assert.deepEqual(browser.syncRegistrations, [], "and nothing was registered")
})

test("a queued entry carries the CSRF token the worker will need", async () => {
  await reset()
  const [ stored ] = [ await enqueue(entry()) ]

  assert.equal(stored.csrfToken, "csrf-token")
  assert.equal((await all())[0].csrfToken, "csrf-token")
})

test("marking an entry refused does not ask for another sync", async () => {
  await reset()
  await enqueue(entry())
  browser.syncRegistrations.length = 0
  browser.stubFetch(() => refused(403))

  await flush()

  assert.deepEqual(browser.syncRegistrations, [], "a refusal is not a reason to retry")
  assert.equal((await all())[0].rejected, 403)
})
