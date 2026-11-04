import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"

import { api } from "@/api/client"
import { BankForm } from "@/components/bank-form"
import { Loading } from "@/components/form"
import { Panel } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { confirm } from "@/lib/confirm"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"

export const Route = createFileRoute("/_app/bank_accounts/$id/edit")({ component: EditBank })

function EditBank() {
  const id = Number(Route.useParams().id)
  usePage("Edit bank account", "/bank_accounts", { narrow: true })
  const { data } = useQuery({ queryKey: ["bank_account", id], queryFn: () => api.bankAccount(id) })
  const remove = useMutation({
    mutationFn: () => api.deleteBankAccount(id),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      go("/bank_accounts")
    },
  })
  if (!data) return <Loading />

  return (
    <div className="grid gap-5">
      <Panel>
        <BankForm bank={data} />
      </Panel>
      <Panel title="Remove" description="Customers will no longer see this account.">
        <Button
          variant="destructive"
          disabled={remove.isPending}
          onClick={async () => {
            if (await confirm("Remove these bank details?|Customers will no longer see this account.", { danger: true })) remove.mutate()
          }}
        >
          <Trash2Icon /> Remove this account
        </Button>
      </Panel>
    </div>
  )
}
