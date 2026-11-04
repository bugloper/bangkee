import { useSyncExternalStore } from "react"

/** A tiny observable value, for the few bits of UI state that live outside any one screen. */
export function createStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T | ((current: T) => T)) {
      value = typeof next === "function" ? (next as (current: T) => T)(value) : next
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    use(): T {
      return useSyncExternalStore(this.subscribe, this.get, this.get)
    },
  }
}
