import { Controller } from "@hotwired/stimulus"

// Toggles an inline panel — the reject-with-reason form, an expanded set of
// line items, the add-bank form.
export default class extends Controller {
  static targets = ["panel"]

  toggle(event) {
    event.preventDefault()
    this.panelTarget.hidden = !this.panelTarget.hidden
  }
}
