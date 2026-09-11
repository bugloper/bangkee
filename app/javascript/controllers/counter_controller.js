import { Controller } from "@hotwired/stimulus"

// The counter display: refreshes itself and chimes when an order arrives.
//
// Polling rather than a WebSocket, for the same reason the rest of this app
// polls — a dropped socket fails silently, and a restaurant that stops seeing
// orders without knowing it is worse than one that checks every few seconds.
//
// The chime is synthesised rather than played from a file: no asset to load on
// a slow connection, and nothing to go missing.
export default class extends Controller {
  static targets = ["soundButton", "status"]
  static values = {
    url: String,
    latest: Number,
    interval: { type: Number, default: 5000 }
  }

  connect() {
    this.soundOn = this.readPreference()
    this.renderSoundButton()
    this.timer = setInterval(() => this.check(), this.intervalValue)
  }

  disconnect() {
    clearInterval(this.timer)
  }

  // Browsers refuse to play audio until the page has been interacted with, so
  // the chime has to be switched on by a tap. That tap is also what creates
  // the AudioContext.
  toggleSound(event) {
    event.preventDefault()
    this.soundOn = !this.soundOn

    if (this.soundOn) {
      this.audio ||= new (window.AudioContext || window.webkitAudioContext)()
      this.audio.resume?.()
      this.chime()
    }

    try { localStorage.setItem("bangkee.counter.sound", this.soundOn ? "1" : "0") } catch (_) {}
    this.renderSoundButton()
  }

  async check() {
    if (!navigator.onLine) return this.setStatus(" · offline")

    let html
    try {
      const response = await fetch(this.urlValue, { headers: { Accept: "text/html" }, credentials: "same-origin" })
      if (!response.ok) return this.setStatus(" · not connected")
      html = await response.text()
    } catch (_) {
      return this.setStatus(" · not connected")
    }

    this.setStatus("")
    const latest = Number(html.match(/data-counter-latest-value="(\d+)"/)?.[1] ?? 0)
    if (latest === this.latestValue) return

    // Something changed. A higher id means a new order rather than one of ours
    // being cleared, and only that is worth making a noise about.
    if (latest > this.latestValue && this.soundOn) this.chime()
    this.latestValue = latest
    window.location.reload()
  }

  // Two short notes — audible across a room, and not so alarming that staff
  // switch it off on the first evening.
  chime() {
    if (!this.audio) return

    const play = (frequency, start, duration) => {
      const oscillator = this.audio.createOscillator()
      const gain = this.audio.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      oscillator.connect(gain)
      gain.connect(this.audio.destination)

      const at = this.audio.currentTime + start
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.05)
    }

    play(880, 0, 0.18)
    play(1320, 0.16, 0.28)
  }

  renderSoundButton() {
    if (!this.hasSoundButtonTarget) return
    this.soundButtonTarget.textContent = this.soundOn ? "Sound on" : "Sound off"
    this.soundButtonTarget.classList.toggle("is-locked", !this.soundOn)
  }

  setStatus(text) {
    if (this.hasStatusTarget) this.statusTarget.textContent = text
  }

  readPreference() {
    try { return localStorage.getItem("bangkee.counter.sound") === "1" } catch (_) { return false }
  }
}
