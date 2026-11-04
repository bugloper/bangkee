import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { AdminOverview } from "@/components/admin-overview"
import { Landing } from "@/components/landing"
import { Shell } from "@/components/shell"
import { StaffOnly } from "@/components/staff-only"
import { requireMe } from "@/lib/gate"
import { isAdminHost } from "@/lib/host"
import { meQuery } from "@/lib/me"

// "/" is three different pages. At admin.<domain> it is the operator's
// overview. At the app's address a visitor gets the homepage, and someone
// signed in goes straight to their own home screen.
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context, location }) => {
    if (isAdminHost()) {
      await requireMe(context.queryClient, location.href)
      return
    }
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me) throw redirect({ to: "/dashboard", replace: true })
  },
  component: () => (isAdminHost() ? <Console /> : <Landing />),
})

function Console() {
  const { data: me } = useQuery(meQuery)
  if (!me) return null
  if (!me.user.platform_admin) return <StaffOnly me={me} />
  return (
    <Shell me={me}>
      <AdminOverview />
    </Shell>
  )
}
