import { Controller } from "@hotwired/stimulus"
import { forAccount, remove, flush, QUEUE_CHANGED } from "offline_queue"

// Shows the entries still waiting to reach the shop's books. They live only on
// this device until they send, so they are rendered here rather than fetched.
export default class extends Controller {
  static targets = ["list", "count"]
  static values = { accountId: String }

  connect() {
    this.render = this.render.bind(this)
    document.addEventListener(QUEUE_CHANGED, this.render)
    this.render()
  }

  disconnect() {
    document.removeEventListener(QUEUE_CHANGED, this.render)
  }

  async render() {
    const entries = await forAccount(this.accountIdValue)
    this.element.hidden = entries.length === 0
    if (entries.length === 0) return

    if (this.hasCountTarget) this.countTarget.textContent = entries.length
    this.listTarget.innerHTML = entries.map((entry) => this.row(entry)).join("")
  }

  row(entry) {
    const amount = Number(entry.amount)
    const money = isNaN(amount)
      ? entry.amount
      : `Nu. ${amount.toLocaleString("en-US", amount % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {})}`
    const when = new Date(entry.queuedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    const rejected = entry.rejected
      ? `<div class="row__sub row__sub--warn">The shop's server refused this — open it again to re-enter it.</div>`
      : `<div class="row__sub">Queued ${when} — sends when you are back online</div>`

    return `
      <div class="row row--static">
        <span class="tag ${entry.label === "payment" ? "tag--payment" : "tag--credit"}">${entry.label.toUpperCase()}</span>
        <div class="row__main">
          <div class="row__title">${money}${entry.description ? ` · ${this.escape(entry.description)}` : ""}</div>
          ${rejected}
        </div>
        <button class="btn btn--tiny btn--void btn--row" data-action="queue-list#discard" data-key="${entry.key}">Discard</button>
      </div>`
  }

  escape(text) {
    const node = document.createElement("div")
    node.textContent = text
    return node.innerHTML
  }

  async discard(event) {
    event.preventDefault()
    if (!window.confirm("Discard this queued entry? It will never reach the book.")) return
    await remove(event.currentTarget.dataset.key)
  }

  retry(event) {
    event.preventDefault()
    flush()
  }
}
