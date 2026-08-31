import { Controller } from "@hotwired/stimulus"

// Shows the screenshot the moment it is chosen — on a slow connection that is
// the only way to know the right picture is attached before uploading it.
export default class extends Controller {
  static targets = ["input", "preview", "placeholder"]

  show() {
    const file = this.inputTarget.files[0]
    if (!file) return

    this.previewTarget.src = URL.createObjectURL(file)
    this.previewTarget.hidden = false
    if (this.hasPlaceholderTarget) this.placeholderTarget.hidden = true
  }
}
