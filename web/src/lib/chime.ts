// Two short notes — audible across a room, and not so alarming that staff
// switch it off on the first evening. Synthesised rather than played from a
// file: nothing to load on a slow connection, and nothing to go missing.

let audio: AudioContext | null = null

/** Browsers refuse audio until a tap; the tap that switches sound on calls this. */
export function unlockAudio() {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  audio ??= new Context()
  void audio.resume?.()
}

export function chime() {
  if (!audio) return
  const context = audio
  const play = (frequency: number, start: number, duration: number) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = frequency
    oscillator.connect(gain)
    gain.connect(context.destination)
    const at = context.currentTime + start
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    oscillator.start(at)
    oscillator.stop(at + duration + 0.05)
  }
  play(880, 0, 0.18)
  play(1320, 0.16, 0.28)
}
