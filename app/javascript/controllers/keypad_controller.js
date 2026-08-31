import { Controller } from "@hotwired/stimulus"

// The on-screen amount keypad. Thumb-sized keys beat a phone keyboard when
// you are entering money one-handed behind a counter.
export default class extends Controller {
  static targets = ["input", "preview"]
  static values = { previewPrefix: { type: String, default: "" } }

  press(event) {
    event.preventDefault()
    const key = event.currentTarget.dataset.key
    let value = this.inputTarget.value

    if (key === "back") {
      value = value.slice(0, -1)
    } else if (key === ".") {
      if (!value.includes(".")) value = (value || "0") + "."
    } else {
      if (value.includes(".") && value.split(".")[1].length >= 2) return
      if (value.replace(".", "").length >= 9) return
      value = value === "0" ? key : value + key
    }

    this.inputTarget.value = value
    this.inputTarget.dispatchEvent(new Event("input", { bubbles: true }))
    this.refresh()
  }

  refresh() {
    if (!this.hasPreviewTarget) return
    const amount = parseFloat(this.inputTarget.value)
    this.previewTarget.textContent = isNaN(amount) || amount <= 0
      ? ""
      : `${this.previewPrefixValue}Nu. ${amount.toLocaleString("en-US", amount % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {})}`
  }
}
