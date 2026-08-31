import { Controller } from "@hotwired/stimulus"
import { toast } from "toast"

// Registers the service worker, offers installation, and — only after the user
// has done something meaningful — asks for notification permission.
export default class extends Controller {
  static values = { vapidKey: String, askPush: Boolean }

  connect() {
    this.registerServiceWorker()
    this.watchInstallPrompt()
    this.offerNotifications()
  }

  // The brief is explicit: ask in context, after something meaningful, never on
  // first load. The server sets data-pwa-ask-push-value on the page that
  // follows a write, and "Not now" is remembered on the device.
  offerNotifications() {
    if (!this.askPushValue) return
    if (!("Notification" in window) || Notification.permission !== "default") return
    if (!this.hasVapidKeyValue) return

    let dismissed = false
    try { dismissed = localStorage.getItem("bangkee.push.dismissed") === "1" } catch (_) {}
    if (dismissed) return

    const prompt = document.getElementById("push-prompt")
    if (prompt) prompt.hidden = false
  }

  async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return
    try {
      this.registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
      if (this.hasVapidKeyValue && Notification.permission === "granted") this.subscribeToPush()
    } catch (error) {
      console.warn("[bangkee] service worker registration failed", error)
    }
  }

  // ---------------------------------------------------------------- install
  watchInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault()
      this.deferredPrompt = event
      this.revealInstallCard()
    })
    window.addEventListener("appinstalled", () => this.hideInstallCard())
  }

  revealInstallCard() {
    if (localStorage.getItem("bangkee.install.dismissed") === "1") return
    const card = document.getElementById("install-card")
    if (card) card.hidden = false
  }

  hideInstallCard() {
    const card = document.getElementById("install-card")
    if (card) card.hidden = true
  }

  async install(event) {
    event.preventDefault()
    if (!this.deferredPrompt) return
    this.deferredPrompt.prompt()
    await this.deferredPrompt.userChoice
    this.deferredPrompt = null
    this.hideInstallCard()
  }

  dismissInstall(event) {
    event.preventDefault()
    localStorage.setItem("bangkee.install.dismissed", "1")
    this.hideInstallCard()
  }

  // ------------------------------------------------------------------ push
  // iOS only allows Web Push from an installed PWA, and every browser refuses
  // a permission request that is not tied to a gesture — hence the button.
  async enablePush(event) {
    event.preventDefault()
    if (!("Notification" in window)) return this.pushMessage("This browser cannot show notifications.")

    document.getElementById("push-prompt")?.setAttribute("hidden", "")

    const permission = await Notification.requestPermission()
    if (permission !== "granted") return this.pushMessage("Notifications are blocked in your browser settings.")

    await this.subscribeToPush()
    this.pushMessage("Notifications are on for this device.")
  }

  async subscribeToPush() {
    if (!this.hasVapidKeyValue || !this.registration) return

    const existing = await this.registration.pushManager.getSubscription()
    const subscription = existing || await this.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(this.vapidKeyValue)
    })

    const payload = subscription.toJSON()
    await fetch("/push_subscription", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name=csrf-token]")?.content
      },
      body: JSON.stringify({
        endpoint: payload.endpoint,
        p256dh_key: payload.keys.p256dh,
        auth_key: payload.keys.auth
      })
    })
  }

  pushMessage(text) {
    const status = document.getElementById("push-status")
    if (status) status.textContent = text
    toast(text)
  }

  urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
    const raw = window.atob(base64)
    return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
  }
}
