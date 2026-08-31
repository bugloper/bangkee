import { Controller } from "@hotwired/stimulus"

// A bottom sheet that lives in the markup: the iOS install steps, the
// notifications ask. Opening is always a deliberate tap, so nothing appears
// over the ledger unasked.
export default class extends Controller {
  static targets = ["sheet"]
  static values = { dismissKey: String }

  open(event) {
    event?.preventDefault()
    this.sheetTarget.hidden = false
    this.escape = (keyEvent) => { if (keyEvent.key === "Escape") this.close(keyEvent) }
    document.addEventListener("keydown", this.escape)
  }

  close(event) {
    event?.preventDefault()
    this.sheetTarget.hidden = true
    document.removeEventListener("keydown", this.escape)
  }

  backdrop(event) {
    if (event.target === this.sheetTarget) this.close(event)
  }

  // "Not now" should mean not now, and not again this device.
  dismiss(event) {
    event?.preventDefault()
    if (this.hasDismissKeyValue) {
      try { localStorage.setItem(this.dismissKeyValue, "1") } catch (_) { /* private mode */ }
    }
    this.close(event)
  }
}
