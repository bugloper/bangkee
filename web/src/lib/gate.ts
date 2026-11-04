import type { QueryClient } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"

import type { Me } from "@/api/types"
import { rememberReturnPath } from "@/lib/go"
import { meQuery } from "@/lib/me"

/** Signed in, or off to sign in and back here afterwards. */
export async function requireMe(queryClient: QueryClient, href: string): Promise<Me> {
  const me = await queryClient.ensureQueryData(meQuery)
  if (!me) {
    rememberReturnPath(href)
    throw redirect({ to: "/session/new", replace: true })
  }
  return me
}
