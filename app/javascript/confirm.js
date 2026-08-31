// Turbo's confirm, rendered as the design's bottom sheet instead of a
// window.confirm — voiding a transaction deserves a sentence of explanation.
import { Turbo } from "@hotwired/turbo-rails"

Turbo.setConfirmMethod((message, element) => {
  return new Promise((resolve) => {
    const [title, body] = message.includes("|") ? message.split("|") : ["Are you sure?", message]
    const destructive = element?.dataset?.turboConfirmStyle === "danger"

    const backdrop = document.createElement("div")
    backdrop.className = "sheet-backdrop"
    backdrop.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="sheet__title">${title}</div>
        <div class="sheet__body">${body}</div>
        <div class="sheet__actions">
          <button class="btn ${destructive ? "btn--danger" : ""}" data-behavior="accept">Yes, continue</button>
          <button class="btn btn--quiet" data-behavior="cancel">Cancel</button>
        </div>
      </div>`

    const finish = (value) => { backdrop.remove(); resolve(value) }
    backdrop.querySelector("[data-behavior=accept]").addEventListener("click", () => finish(true))
    backdrop.querySelector("[data-behavior=cancel]").addEventListener("click", () => finish(false))
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) finish(false) })
    document.addEventListener("keydown", function esc(event) {
      if (event.key === "Escape") { document.removeEventListener("keydown", esc); finish(false) }
    })

    document.body.appendChild(backdrop)
    backdrop.querySelector("[data-behavior=accept]").focus()
  })
})
