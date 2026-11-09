import { createFileRoute, redirect } from "@tanstack/react-router"

import { Landing } from "@/components/landing"
import { meQuery } from "@/lib/me"

// "/" is the homepage for a visitor; someone signed in, the operator
// included, goes straight to their own home screen.
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me) throw redirect({ to: "/dashboard", replace: true })
  },
  component: Landing,
})
