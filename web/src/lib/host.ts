// One server, two front doors: bangkee.bt is the shop and customer app (and
// the homepage), admin.bangkee.bt is the operator's console. The same build
// serves both and decides by the address it was opened at.
//
// In development: http://localhost:5173 and http://admin.localhost:5173.

export function isAdminHost(hostname = window.location.hostname): boolean {
  return hostname.startsWith("admin.")
}

/** The console's address, from wherever the app is open. */
export function adminOrigin(): string {
  const { protocol, host } = window.location
  return `${protocol}//admin.${host.replace(/^admin\./, "")}`
}

/** The shop app's address, from wherever the console is open. */
export function appOrigin(): string {
  const { protocol, host } = window.location
  return `${protocol}//${host.replace(/^admin\./, "")}`
}
