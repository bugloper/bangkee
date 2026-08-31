import { Controller } from "@hotwired/stimulus"
import { enqueue, newKey, flush } from "offline_queue"
import { toast } from "toast"

// Wraps the credit and payment forms. Online, it does nothing and lets Turbo
// submit normally. Offline, it keeps the entry on the device and takes the
// owner back to the account, so the shop can keep serving customers.
export default class extends Controller {
  static values = { accountId: String, redirect: String, label: String }

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
    fields["transaction[idempotency_key]"] = key
    if (!fields["transaction[occurred_at]"]) {
      // Record when it actually happened, not when it finally sends.
      fields["transaction[occurred_at]"] = new Date().toISOString()
    }

    await enqueue({
      key,
      url: form.action,
      accountId: this.accountIdValue,
      label: this.labelValue,
      amount: fields["transaction[amount]"],
      description: fields["transaction[description]"] || fields["transaction[payment_method]"] || "",
      queuedAt: Date.now(),
      fields
    })

    flush()   // in case the connection came back between the tap and here
    Turbo.visit(this.redirectValue, { action: "replace" })
    toast(`Saved on this phone — it reaches the book when you are back online.`)
  }
}
