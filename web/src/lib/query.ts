import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"

import { ApiError } from "@/api/client"
import { flashAlert } from "@/lib/flash"
import { go, rememberReturnPath } from "@/lib/go"

// What the Rails before_actions did with a refused request, done once for
// every query and mutation:
//   401          -> sign in, then come back
//   403 locked   -> Billing, with the reason (BR-40)
//   403 / 404    -> home, with the reason
//   422 / 429    -> the reason as an alert on this screen; a mutation's
//                   validation list (errors[]) is left for its form to show
function handle(error: unknown, kind: "query" | "mutation") {
  if (!(error instanceof ApiError)) {
    if (kind === "mutation") flashAlert("Bangkee could not be reached. Check the connection and try again.")
    return
  }
  const here = window.location.pathname + window.location.search
  switch (error.status) {
    case 401:
      if (!here.startsWith("/session")) rememberReturnPath(here)
      queryClient.setQueryData(["me"], null)
      go("/session/new", { replace: true })
      return
    case 403:
      flashAlert(error.body.error)
      go(error.writeLocked ? "/subscription" : "/", { replace: true })
      return
    case 404:
      flashAlert(error.body.error && error.body.error !== "Not found" ? error.body.error : "That page does not exist.")
      go("/", { replace: true })
      return
    default:
      if (error.validation.length > 0) return
      flashAlert(error.body.error ?? error.message)
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // The "me" query answers a visitor with null; it never redirects.
      if (query.queryKey[0] === "me") return
      // Screens that handle their own failure say so in meta.
      if (query.meta?.handlesErrors) return
      handle(error, "query")
    },
  }),
  mutationCache: new MutationCache({ onError: (error) => handle(error, "mutation") }),
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
      // Try the request even with no signal: the service worker answers it
      // from the last copy it cached. The default would wait for the network.
      networkMode: "offlineFirst",
    },
    mutations: {
      // Writes must run offline too — writeOrQueue is what decides to keep
      // the entry on the device. The default pauses them until the network
      // returns, which would leave the shopkeeper staring at the form.
      networkMode: "always",
    },
  },
})

/** After a write, every screen may be stale — badges, balances, lists. */
export function refreshAll() {
  return queryClient.invalidateQueries()
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { handlesErrors?: boolean }
  }
}
