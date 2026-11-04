import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { Shell } from "@/components/shell"
import { StaffOnly } from "@/components/staff-only"
import { requireMe } from "@/lib/gate"
import { isAdminHost } from "@/lib/host"
import { meQuery } from "@/lib/me"

// The operator's console screens. They exist only at admin.<domain>; on the
// app's own address they are not there at all.
export const Route = createFileRoute("/_admin")({
  beforeLoad: async ({ context, location }) => {
    if (!isAdminHost()) throw redirect({ to: "/", replace: true })
    await requireMe(context.queryClient, location.href)
  },
  component: AdminLayout,
})

function AdminLayout() {
  const { data: me } = useQuery(meQuery)
  if (!me) return null
  if (!me.user.platform_admin) return <StaffOnly me={me} />
  return (
    <Shell me={me}>
      <Outlet />
    </Shell>
  )
}
