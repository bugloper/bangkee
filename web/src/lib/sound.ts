// Bangkee's own chime for a notification that arrives while the app is open.
// A push notification cannot choose its sound — the device plays its own —
// but an open page can, so the in-app one is recognisably Bangkee: a rising
// three-note bell for money in, a two-note bell for anything else, and a
// falling pair for an overdue balance.
//
// Synthesised rather than a sound file, so there is nothing to download or
// cache. Browsers keep a page silent until the person has tapped or typed in
// it. Having signed in counts, so usually the sound is ready at once;
// otherwise the first tap anywhere wakes it.

let context: AudioContext | null = null

export function unlockSound() {
  const wake = () => {
    try {
      context ??= new AudioContext()
      if (context.state === "suspended") void context.resume()
    } catch {
      /* no Web Audio: notifications stay silent */
    }
  }
  wake()
  // Capture, so a control that stops the event on its way up still counts.
  window.addEventListener("pointerdown", wake, { once: true, capture: true })
  window.addEventListener("keydown", wake, { once: true, capture: true })
}

const TUNES: Record<string, number[]> = {
  payment: [1046.5, 1318.51, 1567.98], // C6 E6 G6 — money in
  overdue: [659.25, 523.25], // E5 C5 — attention
  default: [1318.51, 987.77], // E6 B5
}

export function chime(kind: string) {
  const audio = context
  if (!audio || audio.state !== "running") return
  const notes = TUNES[kind] ?? TUNES.default
  const start = audio.currentTime + 0.02
  notes.forEach((frequency, index) => {
    const at = start + index * 0.13
    // A sine and a quiet octave above it: a small bell, not a beep.
    for (const [multiple, loudness] of [
      [1, 0.22],
      [2, 0.05],
    ]) {
      const tone = audio.createOscillator()
      const volume = audio.createGain()
      tone.type = "sine"
      tone.frequency.value = frequency * multiple
      volume.gain.setValueAtTime(0.0001, at)
      volume.gain.exponentialRampToValueAtTime(loudness, at + 0.012)
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.7)
      tone.connect(volume).connect(audio.destination)
      tone.start(at)
      tone.stop(at + 0.75)
    }
  })
}
