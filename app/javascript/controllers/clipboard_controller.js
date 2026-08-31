import { Controller } from "@hotwired/stimulus"

// Copy the invite link, and use the native share sheet when the device has one.
export default class extends Controller {
  static targets = ["source", "button"]

  async copy(event) {
    event.preventDefault()
    await navigator.clipboard.writeText(this.sourceTarget.value)
    const button = this.hasButtonTarget ? this.buttonTarget : event.currentTarget
    const original = button.textContent
    button.textContent = "Copied"
    setTimeout(() => { button.textContent = original }, 1800)
  }

  async share(event) {
    event.preventDefault()
    if (!navigator.share) return this.copy(event)
    try {
      await navigator.share({ title: "Bangkee", text: "See your credit balance at my shop", url: this.sourceTarget.value })
    } catch (_) { /* the user dismissed the sheet */ }
  }
}
