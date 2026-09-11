import { Controller } from "@hotwired/stimulus"
import { enqueue, newKey, flush } from "offline_queue"
import { toast } from "toast"

// Wraps a form that must not be lost when the signal goes — a credit, a
// payment, a round added to a tab. Online it does nothing and lets Turbo submit
// normally. Offline it keeps the entry on the device and moves the shopkeeper
// on, so they can keep serving.
export default class extends Controller {
  static values = {
    queueKey: String,              // which screen shows it while it waits
    scope: { type: String, default: "transaction" },   // the params key it posts under
    redirect: String,
    label: String,
    dated: { type: Boolean, default: true }            // stamp when it happened
  }

  async submit(event) {
    if (navigator.onLine) return

    event.preventDefault()

    const form = this.element
    const fields = {}
    new FormData(form).forEach((value, name) => {
      if (name === "authenticity_token" || name === "commit") return   // stale by replay time
      if (value instanceof File) return                                 // never queue an upload
      fields[name] = value
    })

    const key = newKey()
    const scope = this.scopeValue
    fields[`${scope}[idempotency_key]`] = key
    if (this.datedValue && !fields[`${scope}[occurred_at]`]) {
      // Record when it actually happened, not when it finally sends.
      fields[`${scope}[occurred_at]`] = new Date().toISOString()
    }

    await enqueue({
      key,
      url: form.action,
      queueKey: this.queueKeyValue,
      label: this.labelValue,
      amount: fields[`${scope}[amount]`] || fields[`${scope}[unit_price]`],
      description: fields[`${scope}[description]`] || fields[`${scope}[payment_method]`] ||
                   fields[`${scope}[name]`] || "",
      queuedAt: Date.now(),
      fields
    })

    flush()   // in case the connection came back between the tap and here
    Turbo.visit(this.redirectValue, { action: "replace" })
    toast(`Saved on this phone — it reaches the book when you are back online.`)
  }
}
