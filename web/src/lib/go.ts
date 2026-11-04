// Navigation from outside React (the query client's error handlers). The
// router registers itself here at start-up.

type Navigate = (to: string, options?: { replace?: boolean }) => void

let navigateImpl: Navigate = (to) => window.location.assign(to)

export function setNavigator(navigate: Navigate) {
  navigateImpl = navigate
}

export function go(to: string, options?: { replace?: boolean }) {
  navigateImpl(to, options)
}

/** "/accounts/3?mode=itemized" -> the router's { to, search }. */
export function splitHref(href: string): { to: string; search: Record<string, string> | undefined } {
  const [to, query] = href.split("?")
  return { to, search: query ? Object.fromEntries(new URLSearchParams(query)) : undefined }
}

const RETURN_KEY = "bangkee.return_to"

/** Remembered when a signed-out visitor is sent to sign in. */
export function rememberReturnPath(path: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, path)
  } catch {
    /* private mode */
  }
}

export function takeReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    return path
  } catch {
    return null
  }
}
