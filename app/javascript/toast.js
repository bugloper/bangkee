// Transient feedback that is not worth a page reload: an entry queued, a device
// registered, the queue drained. Flash messages stay in the banner; this is for
// things that happen in the browser.
export function toast(message) {
  let stack = document.querySelector(".toast-stack")
  if (!stack) {
    stack = document.createElement("div")
    stack.className = "toast-stack no-print"
    document.body.appendChild(stack)
  }

  const note = document.createElement("div")
  note.className = "toast"
  note.setAttribute("role", "status")
  note.textContent = message
  stack.appendChild(note)

  setTimeout(() => note.remove(), 3200)
}
