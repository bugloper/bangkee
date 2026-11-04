import { QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { setNavigator, splitHref } from "@/lib/go"
import { flush } from "@/lib/offline-queue"
import { registerServiceWorker } from "@/lib/pwa"
import { queryClient, refreshAll } from "@/lib/query"
import { routeTree } from "./routeTree.gen"

const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent", scrollRestoration: true })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

setNavigator((href, options) => {
  const { to, search } = splitHref(href)
  void router.navigate({ to: to as never, search: search as never, replace: options?.replace })
})

// Replay entries recorded with no signal whenever the connection returns,
// and once on load in case the browser was closed while some were waiting.
async function replay() {
  const { sent } = await flush()
  if (sent > 0) await refreshAll()
}
window.addEventListener("online", () => void replay())
void replay()
void registerServiceWorker()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
