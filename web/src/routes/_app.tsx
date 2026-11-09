import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { useEffect } from "react"

import type { Me } from "@/api/types"
import { Shell } from "@/components/shell"
import { requireMe } from "@/lib/gate"
import { meQuery } from "@/lib/me"
import { resubscribeIfGranted } from "@/lib/pwa"
import { queryClient } from "@/lib/query"

// An operator's home is the console's overview; of the app's other screens
// they have only these. The shop's and the customer's are not theirs.
const CONSOLE_SCREENS = ["dashboard", "notifications", "settings"]

// Everything behind sign-in: the shell with the sidebar, topbar and tab bar.
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    await requireMe(context.queryClient, location.href)
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me?.user.platform_admin && !CONSOLE_SCREENS.includes(location.pathname.split("/")[1])) throw redirect({ to: "/dashboard", replace: true })
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
  return (
    <Shell me={me}>
      <Outlet />
    </Shell>
  )
}
