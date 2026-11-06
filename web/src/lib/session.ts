import { api } from "@/api/client"
import { go } from "@/lib/go"
import { queryClient } from "@/lib/query"

/** Ends this session; nothing cached from it survives into the next person's. Back to the homepage. */
export async function signOut() {
  await api.signOut().catch(() => undefined)
  queryClient.clear()
  queryClient.setQueryData(["me"], null)
  go("/", { replace: true })
}
