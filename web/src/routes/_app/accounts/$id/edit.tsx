import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { api } from "@/api/client"
import { AccountForm } from "@/components/account-form"
import { Loading } from "@/components/form"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_app/accounts/$id/edit")({ component: EditAccount })

function EditAccount() {
  const id = Number(Route.useParams().id)
  usePage("Edit customer", `/accounts/${id}`, { narrow: true })
  const { data } = useQuery({ queryKey: ["account", id], queryFn: () => api.account(id) })
  if (!data) return <Loading />
  return <AccountForm account={data.account} />
}
