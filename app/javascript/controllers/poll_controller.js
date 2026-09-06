import { Controller } from "@hotwired/stimulus"

// Refreshes a screen that is waiting on background work — reading a shared
// receipt. Polling rather than a WebSocket on purpose: this runs on the phone
// of someone standing in a shop with two bars of signal, where a dropped
// socket would leave them staring at a spinner forever.
export default class extends Controller {
  static values = { url: String, interval: { type: Number, default: 2000 } }

  connect() {
    this.attempts = 0
    this.timer = setInterval(() => this.check(), this.intervalValue)
  }

  disconnect() {
    clearInterval(this.timer)
  }

  check() {
    this.attempts += 1
    // Reading a receipt takes seconds, not minutes. Stop asking after a while
    // rather than polling a stuck job until the battery dies.
    if (this.attempts > 40) return this.disconnect()

    if (!navigator.onLine) return

    fetch(this.urlValue, { headers: { "Accept": "text/html" }, credentials: "same-origin" })
      .then((response) => (response.ok ? response.text() : null))
      .then((html) => {
        if (!html || html.includes('data-controller="poll"')) return
        // The receipt has been read — take the whole page, so the form and its
        // CSRF token come from the server rather than being pieced together.
        window.location.reload()
      })
      .catch(() => { /* still offline; the next tick tries again */ })
  }
}
