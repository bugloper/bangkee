import { StarIcon } from "lucide-react"

import type { BankAccount } from "@/api/types"
import { KV } from "@/components/kit"
import { useT } from "@/lib/i18n"

/** A shop's published accounts, as a customer reads them before transferring. */
export function BankDetails({ banks, full }: { banks: BankAccount[]; full?: boolean }) {
  const t = useT()
  return (
    <div className="grid gap-3">
      {banks.map((bank) => (
        <div key={bank.id} className="rounded-xl border bg-muted/20 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 pb-1 text-sm font-semibold">
            {bank.bank_name}
            {bank.primary && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                <StarIcon className="size-3 fill-current" /> primary
              </span>
            )}
          </div>
          <KV label={t("account.account_name")}>{bank.account_name}</KV>
          <KV label={t("account.account_number")}>
            <span className="tabular select-all">{bank.account_number}</span>
          </KV>
          {full && bank.branch && <KV label={t("account.branch")}>{bank.branch}</KV>}
          {full && bank.instructions && <p className="mt-1.5 border-t pt-2 text-sm text-muted-foreground">{bank.instructions}</p>}
        </div>
      ))}
    </div>
  )
}
