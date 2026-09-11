import { Controller } from "@hotwired/stimulus"

// The customer's side of scan-to-order: steppers and a running total, so the
// person ordering knows what it comes to before the food arrives.
export default class extends Controller {
  static targets = ["line", "quantity", "total", "submit"]

  connect() {
    this.recalculate()
  }

  more(event) {
    this.step(event, 1)
  }

  less(event) {
    this.step(event, -1)
  }

  step(event, direction) {
    event.preventDefault()
    const input = event.currentTarget.closest("[data-order-cart-target='line']")
      .querySelector("[data-order-cart-target='quantity']")

    const next = Math.min(50, Math.max(0, (parseInt(input.value, 10) || 0) + direction))
    input.value = next
    this.recalculate()
  }

  recalculate() {
    let cents = 0
    this.lineTargets.forEach((line) => {
      const quantity = parseInt(line.querySelector("[data-order-cart-target='quantity']").value, 10) || 0
      cents += quantity * Number(line.dataset.price || 0)
      line.classList.toggle("is-chosen", quantity > 0)
    })

    if (this.hasTotalTarget) {
      const amount = cents / 100
      this.totalTarget.textContent = `Nu. ${amount.toLocaleString("en-US", amount % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {})}`
    }
    if (this.hasSubmitTarget) this.submitTarget.disabled = cents === 0
  }
}
