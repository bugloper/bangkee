import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { useEffect } from "react"

import type { Me } from "@/api/types"
import { Shell } from "@/components/shell"
import { StaffOnly } from "@/components/staff-only"
import { requireMe } from "@/lib/gate"
import { isAdminHost } from "@/lib/host"
import { meQuery } from "@/lib/me"
import { resubscribeIfGranted } from "@/lib/pwa"
import { queryClient } from "@/lib/query"

// The console shares only these screens with the app; the rest of the
// shop's screens do not exist on the admin host.
const CONSOLE_SCREENS = ["notifications", "settings"]

// Everything behind sign-in: the shell with the sidebar, topbar and tab bar.
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    await requireMe(context.queryClient, location.href)
    if (isAdminHost() && !CONSOLE_SCREENS.includes(location.pathname.split("/")[1])) throw redirect({ to: "/", replace: true })
  },
  component: AppLayout,
})

function AppLayout() {
  const { data: me } = useQuery(meQuery)

  // Once per signed-in person, not on every badge refresh.
  const userId = me?.user.id
  useEffect(() => {
    const current = queryClient.getQueryData<Me | null>(["me"])
    if (current) void resubscribeIfGranted(current).catch(() => undefined)
  }, [userId])

  if (!me) return null
  if (isAdminHost() && !me.user.platform_admin) return <StaffOnly me={me} />
  return (
    <Shell me={me}>
      <Outlet />
    </Shell>
  )
}
