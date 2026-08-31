import { Controller } from "@hotwired/stimulus"

// Adds and removes rows on an itemized purchase and keeps the running total
// honest while the owner types.
export default class extends Controller {
  static targets = ["rows", "template", "total", "row"]

  add(event) {
    event.preventDefault()
    const markup = this.templateTarget.innerHTML.replace(/NEW_RECORD/g, new Date().getTime())
    this.rowsTarget.insertAdjacentHTML("beforeend", markup)
    this.recalculate()
  }

  remove(event) {
    event.preventDefault()
    const row = event.target.closest("[data-line-items-target='row']")
    const destroyField = row.querySelector("input[name*='_destroy']")

    if (destroyField) {
      destroyField.value = "1"
      row.hidden = true
    } else {
      row.remove()
    }
    this.recalculate()
  }

  recalculate() {
    let total = 0
    this.rowTargets.forEach((row) => {
      if (row.hidden) return
      const quantity = parseFloat(row.querySelector("[data-role='quantity']")?.value) || 0
      const price = parseFloat(row.querySelector("[data-role='price']")?.value) || 0
      total += quantity * price
    })

    if (this.hasTotalTarget) {
      this.totalTarget.textContent = `Nu. ${total.toLocaleString("en-US", total % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {})}`
    }
  }
}
