import { Controller } from "@hotwired/stimulus"

// Opens a payment screenshot full-screen. The owner is comparing a number on a
// phone photo against their bank — sending them to a new browser tab loses the
// queue they were working through.
export default class extends Controller {
  static targets = ["overlay", "image", "caption"]

  open(event) {
    event.preventDefault()
    const trigger = event.currentTarget

    this.imageTarget.src = trigger.dataset.viewerUrl
    this.imageTarget.alt = trigger.dataset.viewerCaption || "Payment screenshot"
    if (this.hasCaptionTarget) this.captionTarget.textContent = trigger.dataset.viewerCaption || ""

    this.overlayTarget.hidden = false
    this.escape = (keyEvent) => { if (keyEvent.key === "Escape") this.close(keyEvent) }
    document.addEventListener("keydown", this.escape)
    this.overlayTarget.querySelector(".viewer__close").focus()
  }

  close(event) {
    event?.preventDefault()
    this.overlayTarget.hidden = true
    this.imageTarget.src = ""
    document.removeEventListener("keydown", this.escape)
  }

  // Clicking the backdrop closes; clicking the image itself does not.
  backdrop(event) {
    if (event.target === this.overlayTarget) this.close(event)
  }
}
