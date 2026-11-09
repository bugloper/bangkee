// Writes that must not be lost when the signal goes — a credit, a payment
// (with its photo), a supplier entry.
// Online they go straight to the server. Offline they are kept on the device
// and the shopkeeper moves on, so they can keep serving; the queue replays
// them later with the same idempotency key.

import { toast } from "sonner"

import { request } from "@/api/client"
import { enqueue, flush, newKey, requestInit, type QueuedFile, type QueuedWrite } from "@/lib/offline-queue"

export interface QueueableWrite {
  url: string
  body: Record<string, unknown>
  /** Sent as a multipart form with the body's fields when present. */
  files?: QueuedFile[]
  queueKey: string
  label: QueuedWrite["label"]
  amount: string
  description: string
  /** Stamp when it happened, not when it finally sends. */
  dated: boolean
}

/** Returns the server's answer, or null when the write was queued. */
export async function writeOrQueue<R>(write: QueueableWrite): Promise<R | null> {
  // A form's own key, when it has one, so a retry after a dropped connection is the same entry.
  const key = typeof write.body.idempotency_key === "string" && write.body.idempotency_key ? write.body.idempotency_key : newKey()
  if (navigator.onLine) {
    const body = { ...write.body, idempotency_key: key }
    return request<R>("POST", write.url, write.files?.length ? (requestInit({ body, files: write.files }).body as FormData) : body)
  }

  const body: Record<string, unknown> = { ...write.body, idempotency_key: key }
  if (write.dated && !body.occurred_at) body.occurred_at = new Date().toISOString()
  await enqueue({ key, url: write.url, body, files: write.files, queueKey: write.queueKey, label: write.label, amount: write.amount, description: write.description })
  void flush() // in case the connection came back between the tap and here
  toast("Saved on this phone — it reaches the book when you are back online.")
  return null
}
