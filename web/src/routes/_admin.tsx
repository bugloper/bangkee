import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { Shell } from "@/components/shell"
import { requireMe } from "@/lib/gate"
import { meQuery } from "@/lib/me"

// The operator's console screens: at the app's own address, for operators
// only. Anyone else is sent to their own home.
export const Route = createFileRoute("/_admin")({
  beforeLoad: async ({ context, location }) => {
    await requireMe(context.queryClient, location.href)
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me?.user.platform_admin) throw redirect({ to: "/dashboard", replace: true })
  },
  component: AdminLayout,
})

function AdminLayout() {
  const { data: me } = useQuery(meQuery)
  if (!me) return null
  return (
    <Shell me={me}>
      <Outlet />
    </Shell>
  )
}
