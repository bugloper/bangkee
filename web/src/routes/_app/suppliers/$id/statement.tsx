import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { api, type StatementRange } from "@/api/client"
import { Loading } from "@/components/form"
import { StatementView } from "@/components/statement-view"
import { useMe } from "@/lib/me"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { rangeLabel } from "@/lib/statement-range"
import { longDate } from "@/lib/time"

type Search = { from?: string; to?: string }
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)

export const Route = createFileRoute("/_app/suppliers/$id/statement")({
  validateSearch: (search: Record<string, unknown>): Search => ({ from: isDay(search.from) ? search.from : undefined, to: isDay(search.to) ? search.to : undefined }),
  component: SupplierStatement,
})

/** The shop's book with one supplier over a range of days, to check against the supplier's own. */
function SupplierStatement() {
  const id = Number(Route.useParams().id)
  const range = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const shop = useMe()?.shop?.name ?? "Your shop"
  usePage("Supplier statement", `/suppliers/${id}`)
  const { data, isFetching } = useQuery({ queryKey: ["supplier-statement", id, range.from ?? "", range.to ?? ""], queryFn: () => api.supplierStatement(id, range), placeholderData: keepPreviousData })
  if (!data) return <Loading />
  const { supplier, statement } = data
  const setRange = (next: StatementRange) => void navigate({ search: { from: next.from || undefined, to: next.to || undefined }, replace: true })
  return (
    <StatementView
      statement={statement}
      range={range}
      onRange={setRange}
      isFetching={isFetching}
      heading={
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Supplier statement</h1>
          <p className="mt-1 text-sm text-muted-foreground">{supplier.name}</p>
        </>
      }
      printLine={
        <>
          <div className="text-xl font-bold">{shop}</div>
          <div className="text-sm">
            Supplier statement for {supplier.name} · {rangeLabel(range)} · issued {longDate(statement.generated_at)}
          </div>
        </>
      }
      words={{ taken: "Bought on credit", takenColumn: "Bought", takenEntry: "Bought on credit" }}
      pdfUrl={api.supplierStatementPdfUrl(id, range)}
      filename={`Supplier statement ${supplier.name} ${range.from ?? "start"} to ${range.to ?? "today"}.pdf`}
      shareText={`${shop} — statement with ${supplier.name} (${rangeLabel(range)}). We owe: ${ngultrum(statement.closing_cents)}.`}
      whatsappTo={supplier.phone}
      footnote="Your own record of what you bought on credit and paid. Crossed-out entries are left out. Amounts in Ngultrum."
    />
  )
}
