import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { api, type StatementRange } from "@/api/client"
import { Loading } from "@/components/form"
import { StatementView } from "@/components/statement-view"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { rangeLabel } from "@/lib/statement-range"
import { longDate } from "@/lib/time"

type Search = { from?: string; to?: string }
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)

export const Route = createFileRoute("/_app/accounts/$id/statement")({
  validateSearch: (search: Record<string, unknown>): Search => ({ from: isDay(search.from) ? search.from : undefined, to: isDay(search.to) ? search.to : undefined }),
  component: StatementScreen,
})

/** A customer's statement, for the shop to hand over or the customer to keep. */
function StatementScreen() {
  const id = Number(Route.useParams().id)
  const range = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  usePage("Statement", `/accounts/${id}`)
  const { data, isFetching } = useQuery({ queryKey: ["statement", id, range.from ?? "", range.to ?? ""], queryFn: () => api.statement(id, range), placeholderData: keepPreviousData })
  if (!data) return <Loading />
  const { account, shop, statement } = data
  const setRange = (next: StatementRange) => void navigate({ search: { from: next.from || undefined, to: next.to || undefined }, replace: true })

  return (
    <StatementView
      statement={statement}
      range={range}
      onRange={setRange}
      isFetching={isFetching}
      heading={
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Statement</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {account.display_name} · {shop.name}
          </p>
        </>
      }
      printLine={
        <>
          <div className="text-xl font-bold">{shop.name}</div>
          <div className="text-sm">
            Statement for {account.display_name} · {rangeLabel(range)} · issued {longDate(statement.generated_at)}
          </div>
        </>
      }
      words={{ taken: "Taken on credit", takenColumn: "Credit given", takenEntry: "Goods on credit" }}
      pdfUrl={api.statementPdfUrl(id, range)}
      filename={`Statement ${account.display_name} ${range.from ?? "start"} to ${range.to ?? "today"}.pdf`}
      shareText={`${shop.name} — statement for ${account.display_name} (${rangeLabel(range)}). Balance: ${ngultrum(statement.closing_cents)}.`}
      whatsappTo={data.viewer === "owner" ? account.customer_phone : null}
      footnote={
        <>
          Crossed-out entries are left out, as they are from the balance. Amounts in Ngultrum.
          {data.viewer === "customer" && ` Questions about this statement go to ${shop.name}.`}
        </>
      }
    />
  )
}
