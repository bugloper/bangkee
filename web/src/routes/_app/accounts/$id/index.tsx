import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowDownLeftIcon, ArrowUpRightIcon, LockIcon, PencilIcon, PrinterIcon, ScrollTextIcon, Share2Icon, ShoppingBasketIcon } from "lucide-react"
import { useEffect } from "react"

import { api } from "@/api/client"
import type { AccountDetail } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { BankDetails } from "@/components/bank-details"
import { Loading } from "@/components/form"
import { Empty, Initial, Money, Note, Panel, Row, Rows } from "@/components/kit"
import { LedgerRow } from "@/components/ledger"
import { QueuedWrites } from "@/components/queued-writes"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { useT } from "@/lib/i18n"
import { ngultrum, pluralize } from "@/lib/money"
import { usePage } from "@/lib/page"
import { offerNotifications } from "@/lib/pwa"
import { dateTime } from "@/lib/time"
import { cn } from "@/lib/utils"

// ?entry= is where a notification opens the account: that entry is highlighted.
type Search = { entry?: number }

export const Route = createFileRoute("/_app/accounts/$id/")({
  validateSearch: (search: Record<string, unknown>): Search => ({ entry: Number(search.entry) || undefined }),
  component: AccountScreen,
})

function AccountScreen() {
  const id = Number(Route.useParams().id)
  const { data } = useQuery({ queryKey: ["account", id], queryFn: () => api.account(id) })
  if (!data) return <Loading />
  return data.viewer === "owner" ? <OwnerView data={data} /> : <CustomerView data={data} />
}

type OwnerData = Extract<AccountDetail, { viewer: "owner" }>
type CustomerData = Extract<AccountDetail, { viewer: "customer" }>

/** The balance as the top of an account shows it: the word, the figure, and how late it is. */
function Balance({ label, cents, overdue }: { label: string; cents: number; overdue?: string | false }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <Money cents={cents} tone="auto" className="text-4xl font-semibold tracking-tight sm:text-[2.75rem]" />
        {overdue && <Badge variant="warn">{overdue}</Badge>}
      </div>
    </div>
  )
}

/** The owner's view of one customer: balance, the actions, the ledger, the audit trail. */
function OwnerView({ data }: { data: OwnerData }) {
  const { account } = data
  const { entry: highlighted } = Route.useSearch()
  usePage(account.display_name, "/accounts")
  const locked = data.write_locked
  const rail = useQuery({ queryKey: ["accounts", "", ""], queryFn: () => api.accounts({}) })

  // When writing is locked these lead to Billing, not to a form that would
  // only bounce the owner back with an alert.
  const action = (href: string) => (locked ? "/subscription" : href)
  const big = "h-13 rounded-xl text-[0.9375rem] font-semibold"

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Customers" className="sticky top-20 hidden max-h-[calc(100svh-6rem)] overflow-y-auto rounded-2xl border bg-card p-2 shadow-xs xl:block">
        <div className="px-2.5 pt-1.5 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Customers</div>
        {rail.data?.accounts.map((other) => (
          <AppLink
            key={other.id}
            href={`/accounts/${other.id}`}
            className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors", other.id === account.id ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
          >
            <Initial text={other.display_name} size="sm" src={other.customer_photo_url} />
            <span className="min-w-0 flex-1 truncate font-medium">{other.display_name}</span>
            <Money cents={other.balance_cents} tone="auto" className="text-xs" />
          </AppLink>
        ))}
      </nav>

      <div className="grid gap-6">
        <Panel>
          <div className="flex items-center gap-3">
            <Initial text={account.display_name} size="lg" src={account.customer_photo_url} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold tracking-tight">{account.display_name}</div>
              <div className="text-sm text-muted-foreground">
                {account.customer_phone || "No phone"}
                {account.joined && " · joined"}
              </div>
            </div>
            <div className="flex gap-1.5">
              <AppLink href={`/accounts/${account.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <PencilIcon /> <span className="max-sm:sr-only">Edit</span>
              </AppLink>
              <AppLink href={`/accounts/${account.id}/statement`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <PrinterIcon /> <span className="max-sm:sr-only">Statement</span>
              </AppLink>
            </div>
          </div>

          <div className="mt-6">
            <Balance
              label={account.balance_cents > 0 ? "Outstanding balance" : account.balance_cents < 0 ? "In credit (paid in advance)" : "Settled — nothing owed"}
              cents={account.balance_cents}
              overdue={account.overdue && `${pluralize(account.days_overdue, "day")} overdue`}
            />
          </div>

          {locked && (
            <Note tone="warn" icon={LockIcon} className="mt-5">
              Write actions are locked — renew the subscription in{" "}
              <Link to="/subscription" className="font-medium text-primary underline-offset-2 hover:underline">
                Billing
              </Link>{" "}
              to record entries again.
            </Note>
          )}

          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <AppLink
              href={action(`/accounts/${account.id}/credits/new`)}
              className={buttonVariants({ variant: "credit", className: cn(big, locked && "opacity-50") })}
              title={locked ? "Renew the subscription to record credits" : undefined}
            >
              <ArrowUpRightIcon /> Add credit
            </AppLink>
            <AppLink
              href={action(`/accounts/${account.id}/payments/new`)}
              className={buttonVariants({ variant: "payment", className: cn(big, locked && "opacity-50") })}
              title={locked ? "Renew the subscription to record payments" : undefined}
            >
              <ArrowDownLeftIcon /> Record payment
            </AppLink>
            <AppLink
              href={locked ? "/subscription" : `/accounts/${account.id}/credits/new?mode=itemized`}
              className={buttonVariants({ variant: "outline", className: cn(big, "col-span-2 sm:col-span-1", locked && "opacity-50") })}
              title={locked ? "Renew the subscription to record purchases" : undefined}
            >
              <ShoppingBasketIcon /> Itemized purchase
            </AppLink>
          </div>
        </Panel>

        <QueuedWrites queueKey={`account:${account.id}`} />

        <Panel
          flush
          title="Transaction history"
          action={
            <AppLink href={`/accounts/${account.id}/receipts`} className="text-[0.8125rem] font-medium text-primary hover:underline">
              Receipts
            </AppLink>
          }
        >
          {data.ledger.length > 0 ? (
            <div className="divide-y">
              {data.ledger.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} owner locked={locked} highlight={entry.id === highlighted} />
              ))}
            </div>
          ) : (
            <Empty icon={ScrollTextIcon} title="No transactions yet">
              Record the first credit or payment with the buttons above.
            </Empty>
          )}
        </Panel>

        <Panel flush title={`Invite ${account.customer_name}`}>
          <Rows>
            <Row
              href={`/accounts/${account.id}/invite`}
              leading={
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                  <Share2Icon className="size-4" />
                </span>
              }
              title={account.joined ? "Invite link" : "Share the invite link"}
              subtitle={account.joined ? "Already linked to their own login" : "So they can watch their balance themselves"}
              chevron
            />
          </Rows>
        </Panel>

        {data.audit_events.length > 0 && (
          <Panel flush title="Audit log" footer={<span className="text-xs text-muted-foreground">Append-only — the most recent events for this account.</span>}>
            <div className="divide-y">
              {data.audit_events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <span className="mt-0.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">{event.action}</span>
                  <div className="min-w-0 flex-1">
                    <div className="tabular text-sm">{event.amount_cents != null ? ngultrum(event.amount_cents) : account.display_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {dateTime(event.created_at)} · {event.actor_name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

/** What the customer sees at one shop: read-only, with where to pay. */
function CustomerView({ data }: { data: CustomerData }) {
  const t = useT()
  const { account, shop } = data
  const { entry: highlighted } = Route.useSearch()
  usePage(shop.name, "/dashboard")
  // A customer never records anything, so opening their account at a shop is
  // the moment to offer notifications (once, until they answer).
  useEffect(() => offerNotifications(), [])

  // A desktop keeps the balance and how to pay in view beside the history.
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 xl:max-w-none xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] xl:items-start">
      <div className="grid gap-6 xl:sticky xl:top-24">
      <Panel>
        <div className="flex items-center gap-3">
          <Initial text={shop.name} size="lg" src={shop.photo_url} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold tracking-tight">{shop.name}</div>
            <div className="text-sm text-muted-foreground">Your credit account</div>
          </div>
          <AppLink href={`/accounts/${account.id}/statement`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <PrinterIcon /> <span className="max-sm:sr-only">{t("account.statement")}</span>
          </AppLink>
        </div>

        <div className="mt-6">
          <Balance
            label={account.balance_cents > 0 ? t("account.you_owe") : account.balance_cents < 0 ? t("account.paid_in_advance") : t("account.settled_nothing_owed")}
            cents={account.balance_cents}
            overdue={account.overdue && t("account.days_overdue", { count: account.days_overdue })}
          />
        </div>

      </Panel>

      {data.bank_accounts.length > 0 && (
        <Panel title={t("account.how_to_pay", { shop: shop.name })}>
          <BankDetails banks={data.bank_accounts} full />
        </Panel>
      )}
      </div>

      <Panel
        flush
        title={t("account.transaction_history")}
        action={
          <AppLink href={`/accounts/${account.id}/receipts`} className="text-[0.8125rem] font-medium text-primary hover:underline">
            Receipts
          </AppLink>
        }
      >
        {data.ledger.length > 0 ? (
          <div className="divide-y">
            {data.ledger.map((entry) => (
              <LedgerRow key={entry.id} entry={entry} owner={false} locked={false} highlight={entry.id === highlighted} />
            ))}
          </div>
        ) : (
          <Empty icon={ScrollTextIcon} title={t("account.nothing_recorded_title")}>
            {t("account.nothing_recorded_body")}
          </Empty>
        )}
      </Panel>
    </div>
  )
}
