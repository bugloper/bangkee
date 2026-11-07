import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  ArrowDownIcon,
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  BellRingIcon,
  CheckIcon,
  HistoryIcon,
  ImageIcon,
  type LucideIcon,
  MapPinIcon,
  PackageIcon,
  PrinterIcon,
  SearchIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react"

import { api } from "@/api/client"
import { Logo, LogoMark } from "@/components/brand"
import { Chips } from "@/components/catalog"
import { ShopCard } from "@/components/shop-view"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { matches } from "@/lib/catalog"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { cn } from "@/lib/utils"

// The front door at bangkee.bt for anyone not signed in. One idea: one credit
// book, two phones. The hero lets a visitor record an entry and watch it land
// on the customer's phone; the rest says what that replaces, what else comes
// with it, and what it costs. The pictures are the app drawn in markup.

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8"
const YEAR = new Date().getFullYear()

export function Landing() {
  usePage(undefined)
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Notebook />
        <Shops />
        <Features />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}

function usePricing() {
  return useQuery({ queryKey: ["pricing"], queryFn: api.pricing, staleTime: Infinity }).data
}

// -------------------------------------------------------------------- hero

function Hero() {
  const pricing = usePricing()
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-56 left-1/2 h-[40rem] w-[70rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.6_0.17_264/0.14),transparent)]" />
      </div>
      <div className={cn(container, "pt-14 pb-20 text-center sm:pt-20 lg:pb-28")}>
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
          <span className="size-1.5 rounded-full bg-paid" />
          Made for shops in Bhutan
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-7xl">
          One credit book. <span className="text-primary">Two phones.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
          The shop writes it down. The customer sees it — on their own phone, the moment it happens. No flipping pages, no crossed-out accounts.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/registration/new" className={buttonVariants({ size: "xl" })}>
            Start free — 3 months <ArrowRightIcon />
          </Link>
          <Link to="/session/new" className={buttonVariants({ size: "xl", variant: "outline" })}>
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {pricing ? `Then ${ngultrum(pricing.monthly_price_cents)} a month` : "One simple price"} · Customers join free · English & Dzongkha
        </p>
        <Demo />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- the demo

type Entry = { id: number; kind: "credit" | "payment"; what: string; cents: number }

const CREDITS: Omit<Entry, "id" | "kind">[] = [
  { what: "Rice 25 kg", cents: 215_000 },
  { what: "Milk and eggs", cents: 42_000 },
  { what: "Momo, 2 plates", cents: 24_000 },
  { what: "Cooking oil 1 L", cents: 9_500 },
]
const PAYMENTS: Omit<Entry, "id" | "kind">[] = [
  { what: "Paid by mBoB", cents: 150_000 },
  { what: "Paid in cash", cents: 50_000 },
]
// What plays by itself until the visitor taps: two credits, then a payment.
const AUTOPLAY: Entry["kind"][] = ["credit", "credit", "payment"]

const balanceOf = (entries: Entry[]) => entries.reduce((sum, e) => sum + (e.kind === "credit" ? e.cents : -e.cents), 0)

// The shop records; the customer's phone hears it. Tap either button, or
// watch it play by itself.
function Demo() {
  const [entries, setEntries] = useState<Entry[]>([{ id: 0, kind: "credit", what: "Sugar 5 kg", cents: 31_000 }])
  const [counts, setCounts] = useState({ credit: 0, payment: 0, step: 0 })
  const [playing, setPlaying] = useState(true)

  function record(kind: Entry["kind"]) {
    const list = kind === "credit" ? CREDITS : PAYMENTS
    const next = list[counts[kind] % list.length]
    setEntries((current) => [{ id: Date.now(), kind, ...next }, ...current].slice(0, 4))
    setCounts((c) => ({ ...c, [kind]: c[kind] + 1, step: c.step + 1 }))
  }

  useEffect(() => {
    if (!playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setTimeout(() => record(AUTOPLAY[counts.step % AUTOPLAY.length]), counts.step === 0 ? 1600 : 3200)
    return () => clearTimeout(timer)
  })

  const tap = (kind: Entry["kind"]) => {
    setPlaying(false)
    record(kind)
  }
  const balance = balanceOf(entries)
  const latest = entries[0]

  return (
    <div className="mx-auto mt-14 max-w-4xl sm:mt-16">
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-3">
        {/* The shop's side */}
        <Screen label="The shop's phone">
          <div className="flex items-center gap-2.5 border-b px-4 py-3 text-left">
            <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">T</span>
            <div>
              <div className="text-sm font-semibold">Tashi Wangmo</div>
              <div className="text-xs text-muted-foreground">17 61 23 45</div>
            </div>
          </div>
          <div className="px-4 pt-4 text-left">
            <div className="text-xs text-muted-foreground">Tashi owes you</div>
            <div className="tabular mt-0.5 text-3xl font-semibold tracking-tight text-owed">{ngultrum(balance)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 pt-4 pb-4">
            <button
              type="button"
              onClick={() => tap("credit")}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-owed text-sm font-semibold text-white shadow-sm transition-transform hover:brightness-110 active:scale-95"
            >
              <ArrowUpRightIcon className="size-4" /> Add credit
            </button>
            <button
              type="button"
              onClick={() => tap("payment")}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-paid text-sm font-semibold text-white shadow-sm transition-transform hover:brightness-110 active:scale-95"
            >
              <ArrowDownLeftIcon className="size-4" /> Payment
            </button>
          </div>
          <p className="border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">{playing ? "Playing by itself — tap a button to try it" : "Try it: tap again"}</p>
        </Screen>

        {/* The moment between them */}
        <div aria-hidden="true" className="flex items-center justify-center gap-2 text-xs font-semibold text-primary sm:mt-28 sm:flex-col">
          <span className="hidden h-px w-10 bg-gradient-to-r from-transparent to-primary/50 sm:block" />
          <span key={latest.id} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 duration-500 animate-in zoom-in-75">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Instantly
          </span>
          <ArrowDownIcon className="size-4 sm:hidden" />
          <span className="hidden h-px w-10 bg-gradient-to-l from-transparent to-primary/50 sm:block" />
        </div>

        {/* The customer's side */}
        <Screen label="Tashi's phone">
          <div className="relative h-[5rem] px-3 pt-3">
            <div key={latest.id} role="status" className="flex items-start gap-2.5 rounded-2xl border bg-card p-2.5 text-left shadow-lg shadow-foreground/10 duration-500 animate-in fade-in slide-in-from-top-6">
              <LogoMark className="size-7 shrink-0" />
              <div className="min-w-0 text-xs leading-snug">
                <div className="flex justify-between gap-2 font-semibold">
                  <span className="truncate">{latest.kind === "credit" ? "New credit · Karma General Shop" : "Payment · Karma General Shop"}</span>
                  <span className="shrink-0 font-normal text-muted-foreground">now</span>
                </div>
                <div className="mt-0.5 truncate text-muted-foreground">
                  {latest.what} · {ngultrum(latest.cents)}
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 pt-2 text-left">
            <div className="text-xs text-muted-foreground">You owe Karma General Shop</div>
            <div key={balance} className="tabular mt-0.5 text-3xl font-semibold tracking-tight duration-500 animate-in fade-in zoom-in-95">
              {ngultrum(balance)}
            </div>
          </div>
          <ul className="mt-3 divide-y border-t text-left">
            {entries.slice(0, 3).map((entry) => (
              <li key={entry.id} className="flex items-center gap-2.5 px-4 py-2 duration-500 animate-in fade-in">
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", entry.kind === "credit" ? "bg-owed/10 text-owed" : "bg-paid/10 text-paid")}>
                  {entry.kind === "credit" ? <ArrowUpRightIcon className="size-3" /> : <ArrowDownLeftIcon className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{entry.what}</span>
                <span className={cn("tabular text-xs font-semibold", entry.kind === "credit" ? "text-owed" : "text-paid")}>
                  {entry.kind === "credit" ? "+ " : "− "}
                  {ngultrum(entry.cents)}
                </span>
              </li>
            ))}
          </ul>
        </Screen>
      </div>
    </div>
  )
}

function Screen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[22rem]">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="overflow-hidden rounded-[1.75rem] border bg-card shadow-xl shadow-primary/10 ring-1 ring-foreground/5">{children}</div>
    </div>
  )
}

// -------------------------------------------------------------- sections

function SectionIntro({ eyebrow, title, children, center }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <div className="text-sm font-semibold text-primary">{eyebrow}</div>
      <h2 className="mt-3 text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">{children}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- notebook

// The paper book as it really looks, beside the same customer in Bangkee.
function Notebook() {
  const lines: [string, string, string, boolean?][] = [
    ["2/9", "rice, oil", "1,240", true],
    ["9/9", "sugar 5kg", "310", true],
    ["30/9", "PAID — all", "1,550", true],
    ["3/10", "milk, eggs", "420"],
    ["12/10", "rice 25kg", "2,150"],
  ]
  return (
    <section className="border-y bg-muted/40 py-20 sm:py-28">
      <div className={container}>
        <SectionIntro eyebrow="The old way" title="Still flipping pages?" center>
          Every credit means finding the customer's page while they wait. When they settle, the page is crossed out and they start on a fresh one somewhere else in the book.
        </SectionIntro>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-2 lg:gap-8">
          {/* The notebook */}
          <figure>
            <div className="mb-5 text-center text-sm font-semibold text-muted-foreground">The notebook</div>
            <div
              aria-hidden="true"
              className="relative mx-auto max-w-md -rotate-1 rounded-sm bg-[#fffdf5] pt-12 pr-6 pb-8 pl-16 font-hand text-[1.375rem] leading-[2.25rem] text-[#2b3a67] shadow-xl shadow-foreground/10 ring-1 ring-black/5 dark:bg-[#f4f0e2]"
              style={{ backgroundImage: "linear-gradient(to bottom, transparent 2.15rem, #c8d7ee 2.15rem, #c8d7ee 2.25rem)", backgroundSize: "100% 2.25rem", backgroundPositionY: "2.4rem" }}
            >
              <span className="absolute inset-y-0 left-12 w-px bg-[#e8a3a3]" />
              <div className="absolute top-3 right-5 text-base text-[#2b3a67]/60">p. 47</div>
              <div className="absolute top-2.5 left-16 text-2xl font-bold">Tashi W.</div>
              {lines.map(([date, what, amount, crossed]) => (
                <div key={date + what} className={cn("relative flex gap-3", crossed && "text-[#2b3a67]/45")}>
                  <span className="w-12 shrink-0">{date}</span>
                  <span className="flex-1">{what}</span>
                  <span>{amount}</span>
                  {crossed && <span className="absolute top-1/2 -right-2 -left-3 h-0.5 -rotate-[1.5deg] rounded bg-[#2b3a67]/55" />}
                </div>
              ))}
              <div className="mt-1 text-right text-[#c0392b]">cont. p. 112 →</div>
            </div>
            <figcaption className="mx-auto mt-8 grid max-w-md gap-3">
              {["Flip through the book to find one name", "Cross out the page when they settle — the history scatters", "Only the shop holds the record, so it's your word against theirs"].map((text) => (
                <div key={text} className="flex items-start gap-3 text-[0.9375rem] text-muted-foreground">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-owed/10 text-owed">
                    <XIcon className="size-3" strokeWidth={3} />
                  </span>
                  {text}
                </div>
              ))}
            </figcaption>
          </figure>

          {/* Bangkee */}
          <figure>
            <div className="mb-5 text-center text-sm font-semibold text-primary">With Bangkee</div>
            <div aria-hidden="true" className="mx-auto max-w-md overflow-hidden rounded-[1.75rem] border bg-card shadow-xl shadow-primary/10 ring-1 ring-foreground/5">
              <div className="p-4">
                <div className="flex h-11 items-center gap-2 rounded-xl border px-3 text-[0.9375rem]">
                  <SearchIcon className="size-4 text-muted-foreground" />
                  <span>ta</span>
                  <span className="h-5 w-px animate-pulse bg-primary" />
                </div>
              </div>
              <div className="flex items-center gap-3 border-y bg-accent/40 px-4 py-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground">T</span>
                <div className="flex-1">
                  <div className="font-semibold">Tashi Wangmo</div>
                  <div className="text-xs text-muted-foreground">17 61 23 45 · customer since 2024</div>
                </div>
                <span className="tabular font-semibold text-owed">Nu. 2,570</span>
              </div>
              <div className="divide-y">
                {[
                  ["12 Oct", "Rice 25 kg", "+ Nu. 2,150", "owed"],
                  ["3 Oct", "Milk and eggs", "+ Nu. 420", "owed"],
                  ["30 Sep", "Paid by mBoB — settled", "− Nu. 1,550", "paid"],
                  ["9 Sep", "Sugar 5 kg", "+ Nu. 310", "owed"],
                ].map(([date, what, amount, tone]) => (
                  <div key={date} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground">{date}</span>
                    <span className="flex-1">{what}</span>
                    <span className={cn("tabular font-medium", tone === "paid" ? "text-paid" : "text-owed")}>{amount}</span>
                  </div>
                ))}
              </div>
            </div>
            <figcaption className="mx-auto mt-8 grid max-w-md gap-3">
              {["Two letters and their account is open", "Settling up just brings it to zero — every month stays in one place", "The customer sees the same book on their own phone"].map((text) => (
                <div key={text} className="flex items-start gap-3 text-[0.9375rem]">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-paid/15 text-paid">
                    <CheckIcon className="size-3" strokeWidth={3} />
                  </span>
                  {text}
                </div>
              ))}
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- features

const FEATURES: [LucideIcon, string, string][] = [
  [BellRingIcon, "Notifications", "Every entry reaches the customer at once, and late balances remind you both."],
  [PackageIcon, "Your items", "Pick from what you sell, with prices and photos, instead of writing it out."],
  [ImageIcon, "Payment photos", "Keep a straightened photo of each mBoB or mPay screen with the payment."],
  [WifiOffIcon, "Works offline", "No signal? Keep recording; it sends itself when you're back online."],
  [MapPinIcon, "Your shop page", "Photo, hours, prices and a pin on the map, for customers to find you."],
  [BarChart3Icon, "Insights", "Credit and repayments month by month, and who owes the most."],
  [PrinterIcon, "Statements", "The whole account on one page, ready to print or share."],
  [HistoryIcon, "Honest history", "Nothing is ever deleted; a mistake is crossed out and logged."],
]

function Features() {
  return (
    <section id="features" className="scroll-mt-16 border-y bg-muted/40 py-20 sm:py-28">
      <div className={container}>
        <SectionIntro eyebrow="Everything else" title="Built in, from the first day." center />
        <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([Icon, title, body]) => (
            <div key={title}>
              <Icon className="size-6 text-primary" strokeWidth={1.75} />
              <h3 className="mt-3 font-semibold tracking-tight">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------- pricing

function Pricing() {
  const data = usePricing()
  return (
    <section id="pricing" className="scroll-mt-16 py-20 sm:py-28">
      <div className={cn(container, "text-center")}>
        <div className="text-sm font-semibold text-primary">Pricing</div>
        <div className="mx-auto mt-8 max-w-xl rounded-[2rem] border bg-card px-6 py-10 shadow-xl shadow-primary/10 ring-1 ring-primary/10 sm:px-12">
          {data ? (
            <>
              <div className="flex items-baseline justify-center gap-2">
                <span className="tabular text-6xl font-semibold tracking-[-0.04em]">{ngultrum(data.monthly_price_cents)}</span>
                <span className="text-lg text-muted-foreground">a month</span>
              </div>
              <p className="mt-3 text-muted-foreground">
                The first <strong className="font-semibold text-foreground">{data.trial_months} months are free</strong>. After that, about {ngultrum(Math.round(data.annual_price_cents / 365 / 100) * 100)} a day, paid once a year ({ngultrum(data.annual_price_cents)}) by bank transfer.
              </p>
            </>
          ) : (
            <div className="grid justify-items-center gap-3" aria-label="Loading prices">
              <Skeleton className="h-14 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          )}
          <Link to="/registration/new" className={buttonVariants({ size: "xl", className: "mt-8 w-full sm:w-auto sm:px-10" })}>
            Start free <ArrowRightIcon />
          </Link>
          <p className="mt-6 text-sm text-muted-foreground">One plan with everything in it. Customers never pay.</p>
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ header

const SECTIONS = [
  ["Shops", "shops"],
  ["Features", "features"],
  ["Pricing", "pricing"],
  ["FAQ", "faq"],
] as const

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/65 [&:has(+main)]:border-border/60">
      <div className={cn(container, "flex h-16 items-center gap-6")}>
        <Link to="/" aria-label="Bangkee home">
          <Logo />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {SECTIONS.map(([label, id]) => (
            <a key={id} href={`/#${id}`} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/session/new" className={buttonVariants({ variant: "ghost" })}>
            Sign in
          </Link>
          <Link to="/registration/new" className={buttonVariants({ className: "max-sm:hidden" })}>
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  )
}

// ------------------------------------------------------------------- shops

const SHOPS_PAGE = 9

// The shops on Bangkee, for anyone: find one by name, type or town, and open
// it to see what it sells and where it is. No account needed.
function Shops() {
  const { data } = useQuery({ queryKey: ["public_shops"], queryFn: api.publicShops, staleTime: 60_000 })
  const [q, setQ] = useState("")
  const [kind, setKind] = useState("")
  const [limit, setLimit] = useState(SHOPS_PAGE)
  if (data && data.shops.length === 0) return null

  // Only the types some shop actually is.
  const kinds = data ? data.kinds.filter((k) => data.shops.some((shop) => shop.kind === k.key)) : []
  const found = (data?.shops ?? []).filter((shop) => (!kind || shop.kind === kind) && matches(q, shop.name, shop.kind_label, shop.location))

  return (
    <section id="shops" className="scroll-mt-16 py-20 sm:py-28">
      <div className={container}>
        <SectionIntro eyebrow="Shops on Bangkee" title="See what shops near you sell — and at what price.">
          Browse the shops on Bangkee: their items and prices, what is out of stock, their hours and where to find them. No account needed.
        </SectionIntro>
        <div className="mt-10 grid gap-4">
          <div className="relative max-w-xl">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search shops"
              placeholder="Search by name, type or town"
              className="h-11 bg-card pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setLimit(SHOPS_PAGE)
              }}
            />
          </div>
          {kinds.length > 1 && (
            <Chips
              label="Type of business"
              chips={[{ key: "", label: "All" }, ...kinds]}
              value={kind}
              onChange={(key) => {
                setKind(key)
                setLimit(SHOPS_PAGE)
              }}
            />
          )}
          {!data ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading shops">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-[1.25rem]" />
              ))}
            </div>
          ) : found.length > 0 ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {found.slice(0, limit).map((shop) => (
                  <ShopCard key={shop.id} shop={shop} href={`/shop/${shop.id}`} />
                ))}
              </div>
              {found.length > limit && (
                <button type="button" onClick={() => setLimit((n) => n + SHOPS_PAGE)} className={buttonVariants({ variant: "outline", size: "lg", className: "mx-auto bg-card" })}>
                  Show more shops <span className="tabular text-muted-foreground">{found.length - limit} more</span>
                </button>
              )}
            </>
          ) : (
            <p className="rounded-2xl border bg-card px-5 py-8 text-center text-muted-foreground">No shop matches that. Try another name, type or town.</p>
          )}
        </div>
      </div>
    </section>
  )
}

// --------------------------------------------------------------------- faq

function Faq() {
  const data = usePricing()
  const annual = data ? `${ngultrum(data.annual_price_cents)} for one year` : "one year"
  const faqs: [string, React.ReactNode][] = [
    [
      "Who can see my book?",
      "Only you, and each customer for their own account. A customer sees their balance and their entries at your shop — never anyone else's. Your list of customers stays yours.",
    ],
    [
      "What happens if my subscription lapses?",
      "Nothing is deleted. You get a grace period to pay; after it, recording new credits and payments is locked until the subscription is renewed. Throughout, your customers keep read access to their balances and history.",
    ],
    [
      "Does it work without internet?",
      "Yes. Credits and payments you record with no signal are kept safely on the phone and sent automatically when you are back online. Screens you have already opened stay readable.",
    ],
    [
      "How do customers join?",
      "Add the customer with their phone number, then share the invite link Bangkee gives you — by WhatsApp, SMS or however you usually talk. They choose a 4-digit PIN, no email needed, and see their balance straight away.",
    ],
    [
      "What happens when a customer settles up?",
      "Record the payment and their balance reads zero. There is no page to cross out and nothing to start again: their account stays open, the next credit goes on the same account, and every month before it is still in the history and on their statement.",
    ],
    [
      "How do I pay for Bangkee?",
      `By bank transfer. From Billing in the app, transfer ${annual} to Bangkee's account and attach the screenshot. We check it and approve it, usually within one working day.`,
    ],
    [
      "Do I need to install an app?",
      "No app store needed. Bangkee opens in any phone browser, and you can add it to your home screen so it opens like an app, with notifications.",
    ],
    [
      "Is it in Dzongkha?",
      "Yes — everyone can switch between English and Dzongkha from their Profile. Anything not yet translated is shown in English.",
    ],
  ]
  return (
    <section id="faq" className="scroll-mt-16 py-20 sm:py-28">
      <div className={cn(container, "grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16")}>
        <SectionIntro eyebrow="FAQ" title="Questions shop owners ask us.">
          Something else on your mind? Start the free trial and look around — nothing you do in it is lost when you subscribe.
        </SectionIntro>
        <Accordion className="rounded-2xl border bg-card px-5 shadow-xs sm:px-6">
          {faqs.map(([question, answer]) => (
            <AccordionItem key={question} value={question}>
              <AccordionTrigger className="py-4 text-[0.9375rem] font-semibold hover:no-underline">{question}</AccordionTrigger>
              <AccordionContent className="pb-4 text-[0.9375rem] leading-relaxed text-muted-foreground">{answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

// --------------------------------------------------------------- final cta

function FinalCta() {
  return (
    <section className="px-5 pb-20 sm:px-8 sm:pb-28">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[oklch(0.25_0.06_266)] px-6 py-16 text-center text-white sm:px-12 sm:py-20">
        <div aria-hidden="true" className="absolute -top-32 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-[oklch(0.5_0.2_264/0.5)] blur-3xl" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-4xl">Close the notebook. Keep the trust.</h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70">Move your credit book to Bangkee this week. Your first customers can be on it today.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/registration/new" className={buttonVariants({ size: "xl", className: "bg-white text-[oklch(0.25_0.06_266)] hover:bg-white/90" })}>
              Start free trial <ArrowRightIcon />
            </Link>
            <Link to="/session/new" className={buttonVariants({ size: "xl", variant: "ghost", className: "text-white hover:bg-white/10 hover:text-white" })}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ footer

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className={cn(container, "flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between")}>
        <div>
          <Logo />
          <p className="mt-2 text-sm text-muted-foreground">The shared credit book for shops in Bhutan.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <a href="/#pricing" className="hover:text-foreground">
            Pricing
          </a>
          <a href="/#faq" className="hover:text-foreground">
            FAQ
          </a>
          <Link to="/session/new" className="hover:text-foreground">
            Sign in
          </Link>
          <Link to="/registration/new" className="hover:text-foreground">
            Create an account
          </Link>
        </nav>
      </div>
      <div className={cn(container, "border-t py-6 text-xs text-muted-foreground")}>© {YEAR} Bangkee</div>
    </footer>
  )
}
