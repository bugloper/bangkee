// Installing, and Web Push. Notification permission is asked for after the
// person has done something worth being notified about — never on arrival.

import { toast } from "sonner"

import { api } from "@/api/client"
import type { Me } from "@/api/types"
import { queryClient } from "@/lib/query"
import { readFlag, writeFlag } from "@/lib/storage"
import { createStore } from "@/lib/store"

export const INSTALL_DISMISSED = "bangkee.install.dismissed"
export const PUSH_DISMISSED = "bangkee.push.dismissed"

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<unknown>
}

let deferredPrompt: InstallPrompt | null = null
export const installStore = createStore({ available: false })
export const iosSheetStore = createStore(false)
export const pushPromptStore = createStore(false)
export const pushStatusStore = createStore<string | null>(null)

let registration: ServiceWorkerRegistration | null = null

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return
  try {
    registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
  } catch (error) {
    console.warn("[bangkee] service worker registration failed", error)
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferredPrompt = event as InstallPrompt
    if (!readFlag(INSTALL_DISMISSED)) installStore.set({ available: true })
  })
  window.addEventListener("appinstalled", () => installStore.set({ available: false }))
}

export async function install() {
  if (!deferredPrompt) return
  await deferredPrompt.prompt()
  await deferredPrompt.userChoice
  deferredPrompt = null
  installStore.set({ available: false })
}

export function dismissInstall() {
  writeFlag(INSTALL_DISMISSED, true)
  installStore.set({ available: false })
}

/** Keeps an already-granted device subscribed (keys rotate, rows get cleaned up). */
export async function resubscribeIfGranted(me: Me) {
  if (!me.push.configured || !("Notification" in window) || Notification.permission !== "granted") return
  await subscribe(me.push.public_key)
}

// The brief is explicit: ask in context, after something meaningful, never
// on first load. "Not now" is remembered on the device.
export function offerNotifications() {
  const me = queryClient.getQueryData<Me | null>(["me"])
  if (!me?.push.configured || me.push.devices > 0) return
  if (!("Notification" in window) || Notification.permission !== "default") return
  if (readFlag(PUSH_DISMISSED)) return
  pushPromptStore.set(true)
}

export function dismissPush() {
  writeFlag(PUSH_DISMISSED, true)
  pushPromptStore.set(false)
}

function message(text: string) {
  pushStatusStore.set(text)
  toast(text)
}

// iOS only allows Web Push from an installed PWA, and every browser refuses a
// permission request that is not tied to a gesture — hence the button.
export async function enablePush() {
  pushPromptStore.set(false)
  if (!("Notification" in window)) return message("This browser cannot show notifications.")
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return message("Notifications are blocked in your browser settings.")

  const me = queryClient.getQueryData<Me | null>(["me"])
  await subscribe(me?.push.public_key ?? null)
  await queryClient.invalidateQueries({ queryKey: ["me"] })
  message("Notifications are on for this device.")
}

async function subscribe(publicKey: string | null) {
  if (!publicKey || !("serviceWorker" in navigator)) return
  const ready = registration ?? (await navigator.serviceWorker.ready)
  const existing = await ready.pushManager.getSubscription()
  const subscription =
    existing ??
    (await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }))
  const payload = subscription.toJSON()
  await api.subscribePush({ endpoint: payload.endpoint ?? "", p256dh_key: payload.keys?.p256dh ?? "", auth_key: payload.keys?.auth ?? "" })
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}
