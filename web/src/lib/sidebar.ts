// The desktop sidebar's small helpers: which link is the current page, and
// whether the sidebar is folded to icons (remembered on this device).

export function isCurrent(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(path + "/")
}

const FOLDED_KEY = "bangkee.sidebar.folded"

export function readFolded() {
  try {
    return localStorage.getItem(FOLDED_KEY) === "1"
  } catch {
    return false
  }
}

export function storeFolded(folded: boolean) {
  try {
    localStorage.setItem(FOLDED_KEY, folded ? "1" : "0")
  } catch {
    /* private mode */
  }
}

/** ⌘K / Ctrl+K: the search palette, from anywhere. */
export function onCommandKey(open: () => void) {
  const handler = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      open()
    }
  }
  window.addEventListener("keydown", handler)
  return () => window.removeEventListener("keydown", handler)
}
