import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { useEffect } from "react"

import { ConfirmHost } from "@/components/confirm"
import { Toaster } from "@/components/ui/sonner"
import { flashAlert, flashNotice, settleFlash } from "@/lib/flash"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
})

function Root() {
  const location = useRouterState({ select: (state) => state.location })
  const navigate = useNavigate()

  // A redirect from the server (the share target) carries its message as
  // ?notice= or ?alert=; lift it into the flash and tidy the address.
  useEffect(() => {
    const params = new URLSearchParams(location.searchStr)
    const notice = params.get("notice")
    const alert = params.get("alert")
    if (notice || alert) {
      flashNotice(notice)
      flashAlert(alert)
      params.delete("notice")
      params.delete("alert")
      const rest = params.toString()
      void navigate({ to: (location.pathname + (rest ? `?${rest}` : "")) as never, replace: true })
      return
    }
    settleFlash(location.pathname)
  }, [location.pathname, location.searchStr, navigate])

  return (
    <>
      <Outlet />
      <ConfirmHost />
      <Toaster />
    </>
  )
}
