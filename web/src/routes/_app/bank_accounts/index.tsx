import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { InfoIcon, LandmarkIcon } from "lucide-react"

import { api } from "@/api/client"
import { BankForm } from "@/components/bank-form"
import { Empty, Note, Panel, Row, Rows } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/_app/bank_accounts/")({ component: BankAccounts })

function BankAccounts() {
  usePage("Bank details", "/dashboard", { narrow: true })
  const { data } = useQuery({ queryKey: ["bank_accounts"], queryFn: api.bankAccounts })
  const banks = data?.bank_accounts ?? []

  return (
    <div className="grid gap-5">
      <Note icon={InfoIcon}>
        These are the accounts your customers see when they want to pay you by transfer. They upload the screenshot; you confirm it, and Bangkee records the payment.
      </Note>

      {banks.length > 0 ? (
        <Panel flush>
          <Rows>
            {banks.map((bank) => (
              <Row
                key={bank.id}
                href={`/bank_accounts/${bank.id}/edit`}
                leading={
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                    <LandmarkIcon className="size-5" />
                  </span>
                }
                title={
                  <span className="flex items-center gap-1.5">
                    {bank.bank_name}
                    {bank.primary && <Badge variant="brand">Primary</Badge>}
                    {!bank.active && <Badge variant="muted">Hidden</Badge>}
                  </span>
                }
                subtitle={<span className="tabular">{`${bank.account_number} · ${bank.account_name}`}</span>}
                trailing={<span className="text-sm font-medium text-primary">Edit</span>}
              />
            ))}
          </Rows>
        </Panel>
      ) : (
        data && (
          <Panel>
            <Empty icon={LandmarkIcon} title="No bank details yet">
              Add one so customers can pay you by transfer.
            </Empty>
          </Panel>
        )
      )}

      {data && (
        <Panel title="Add a bank account">
          <BankForm key={banks.length} defaultPrimary={banks.length === 0} />
        </Panel>
      )}
    </div>
  )
}
