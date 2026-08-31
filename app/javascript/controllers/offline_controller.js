import { Controller } from "@hotwired/stimulus"

// Shows the offline banner and marks the body so forms can warn that a save
// will not reach the shop's books until the connection is back.
export default class extends Controller {
  static targets = ["banner"]

  connect() {
    this.update = this.update.bind(this)
    window.addEventListener("online", this.update)
    window.addEventListener("offline", this.update)
    this.update()
  }

  disconnect() {
    window.removeEventListener("online", this.update)
    window.removeEventListener("offline", this.update)
  }

  update() {
    const offline = !navigator.onLine
    document.body.classList.toggle("is-offline", offline)
    if (this.hasBannerTarget) this.bannerTarget.hidden = !offline
  }
}
