/** localStorage that never throws: private mode and blocked storage just forget. */
export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

export function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0")
  } catch {
    /* private mode */
  }
}
