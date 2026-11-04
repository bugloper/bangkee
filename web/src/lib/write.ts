// Writes that must not be lost when the signal goes — a credit, a payment.
// Online they go straight to the server. Offline they are kept on the device
// and the shopkeeper moves on, so they can keep serving; the queue replays
// them later with the same idempotency key.

import { toast } from "sonner"

import { request } from "@/api/client"
import { enqueue, flush, newKey, type QueuedWrite } from "@/lib/offline-queue"

export interface QueueableWrite {
  url: string
  body: Record<string, unknown>
  queueKey: string
  label: QueuedWrite["label"]
  amount: string
  description: string
  /** Stamp when it happened, not when it finally sends. */
  dated: boolean
}

/** Returns the server's answer, or null when the write was queued. */
export async function writeOrQueue<R>(write: QueueableWrite): Promise<R | null> {
  if (navigator.onLine) return request<R>("POST", write.url, write.body)

  const key = newKey()
  const body: Record<string, unknown> = { ...write.body, idempotency_key: key }
  if (write.dated && !body.occurred_at) body.occurred_at = new Date().toISOString()
  await enqueue({ key, url: write.url, body, queueKey: write.queueKey, label: write.label, amount: write.amount, description: write.description })
  void flush() // in case the connection came back between the tap and here
  toast("Saved on this phone — it reaches the book when you are back online.")
  return null
}
