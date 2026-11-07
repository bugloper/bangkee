import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ArrowDownLeftIcon, ArrowRightIcon, ArrowUpRightIcon, CloudUploadIcon, MapPinIcon, SearchIcon, WifiOffIcon } from "lucide-react"

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

// The front door at bangkee.bt for anyone not signed in. A headline whose
// ending changes, then one bento grid that says the rest at a glance: the
// demo you can tap is the biggest box, everything else one idea per box.
// The pictures are the app drawn in markup.

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8"
const YEAR = new Date().getFullYear()

export function Landing() {
  usePage(undefined)
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Bento />
        <Shops />
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

function useReducedMotion() {
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  return reduced
}

// -------------------------------------------------------------------- hero

const ENDINGS = ["lives on two phones.", "finds anyone in two letters.", "never loses a page.", "settles without crossing out."]

function Hero() {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % ENDINGS.length), 2800)
    return () => clearInterval(timer)
  }, [reduced])

  return (
    <section className={cn(container, "pt-16 pb-12 text-center sm:pt-24 sm:pb-16")}>
      <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
        <span className="size-1.5 rounded-full bg-paid" />
        Made for shops in Bhutan
      </span>
      <h1 className="mx-auto mt-6 max-w-4xl text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-7xl">
        <span className="sr-only">The credit book that lives on two phones — the shop's and the customer's.</span>
        <span aria-hidden="true">
          The credit book that
          <br />
          <span key={index} className="inline-block text-primary duration-700 animate-in fade-in slide-in-from-bottom-3">
            {ENDINGS[index]}
          </span>
        </span>
      </h1>
      <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-pretty text-muted-foreground">The shop writes it down. The customer sees it on their own phone, the moment it happens.</p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link to="/registration/new" className={buttonVariants({ size: "xl" })}>
          Start free — 3 months <ArrowRightIcon />
        </Link>
        <Link to="/session/new" className={buttonVariants({ size: "xl", variant: "outline" })}>
          Sign in
        </Link>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------- bento

// One box, one idea: a few words of headline, a picture, at most a line.
function Box({ title, line, className, children, id }: { title: string; line?: React.ReactNode; className?: string; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className={cn("flex scroll-mt-24 flex-col overflow-hidden rounded-[1.75rem] border bg-card p-6 shadow-xs transition duration-300 hover:-translate-y-1 hover:shadow-lg", className)}>
      <div className="flex flex-1 items-center justify-center">{children}</div>
      <h3 className="mt-6 text-lg font-semibold tracking-tight">{title}</h3>
      {line && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{line}</p>}
    </div>
  )
}

function Bento() {
  const pricing = usePricing()
  return (
    <section id="features" className={cn(container, "scroll-mt-20 pb-20 sm:pb-28")}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* The demo: the biggest box, because it is the whole idea. */}
        <div className="flex flex-col overflow-hidden rounded-[1.75rem] border bg-card p-6 shadow-xs md:col-span-2 lg:row-span-2">
          <Demo />
          <h3 className="mt-6 text-lg font-semibold tracking-tight">Try it: one book, two phones</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Record a credit or a payment and watch it reach the customer.</p>
        </div>

        <Box title="Two letters, and they're open" line="No flipping through pages while the customer waits.">
          <div aria-hidden="true" className="w-full max-w-[15rem]">
            <div className="flex h-10 items-center gap-2 rounded-xl border px-3 text-sm">
              <SearchIcon className="size-4 text-muted-foreground" />
              ta
              <span className="h-4 w-px animate-pulse bg-primary" />
            </div>
            <div className="mt-2 flex items-center gap-2.5 rounded-xl bg-accent/60 px-3 py-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-card text-xs font-semibold text-accent-foreground">T</span>
              <span className="flex-1 text-left text-sm font-medium">Tashi Wangmo</span>
              <span className="tabular text-xs font-semibold text-owed">Nu. 2,570</span>
            </div>
          </div>
        </Box>

        <Box title="No more crossed-out pages" line="Settling up brings the balance to zero; every month stays.">
          <div
            aria-hidden="true"
            className="w-full max-w-[15rem] -rotate-2 rounded-sm bg-[#fffdf5] py-3 pr-4 pl-9 font-hand text-lg leading-8 text-[#2b3a67] shadow-md ring-1 ring-black/5"
            style={{ backgroundImage: "linear-gradient(to bottom, transparent 1.9rem, #c8d7ee 1.9rem, #c8d7ee 2rem)", backgroundSize: "100% 2rem", backgroundPositionY: "0.75rem" }}
          >
            {[
              ["rice, oil", "1,240", true],
              ["sugar 5kg", "310", true],
              ["milk, eggs", "420", false],
            ].map(([what, amount, crossed]) => (
              <div key={what as string} className={cn("relative flex justify-between", crossed && "text-[#2b3a67]/45")}>
                <span>{what}</span>
                <span>{amount}</span>
                {crossed && <span className="absolute top-1/2 -right-1 -left-2 h-0.5 -rotate-2 rounded bg-[#2b3a67]/55" />}
              </div>
            ))}
          </div>
        </Box>

        <div id="pricing" className="flex scroll-mt-24 flex-col justify-between overflow-hidden rounded-[1.75rem] bg-[linear-gradient(120deg,oklch(0.5_0.26_277),oklch(0.6_0.2_266))] p-6 text-white shadow-lg shadow-primary/25 md:col-span-2">
          <div className="flex items-baseline gap-2">
            {pricing ? <span className="tabular text-5xl font-semibold tracking-[-0.04em]">{ngultrum(pricing.monthly_price_cents)}</span> : <Skeleton className="h-12 w-40 bg-white/20" />}
            <span className="text-white/75">a month</span>
          </div>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">The first {pricing?.trial_months ?? 3} months are free</h3>
              <p className="mt-1 text-sm text-white/75">
                Then about {pricing ? ngultrum(Math.round(pricing.annual_price_cents / 365 / 100) * 100) : "Nu. 5"} a day, paid yearly. Customers never pay.
              </p>
            </div>
            <Link to="/registration/new" className={buttonVariants({ size: "lg", className: "bg-white text-primary shadow-sm hover:bg-white/90" })}>
              Start free <ArrowRightIcon />
            </Link>
          </div>
        </div>

        <Box title="No signal? Keep going" line="It sends itself when you're back online.">
          <div aria-hidden="true" className="relative">
            <WifiOffIcon className="size-14 text-muted-foreground/40" strokeWidth={1.5} />
            <span className="absolute -right-10 -bottom-2 inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs font-medium shadow-sm">
              <CloudUploadIcon className="size-3.5 text-primary" /> 3 waiting
            </span>
          </div>
        </Box>

        <Box title="English and Dzongkha" line="Everyone picks their own.">
          <div aria-hidden="true" className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold tracking-tight">Aa</span>
            <span className="text-muted-foreground/50">·</span>
            <span lang="dz" className="text-3xl font-semibold text-primary">རྫོང་ཁ</span>
          </div>
        </Box>

        <a href="#shops" className="group flex flex-col overflow-hidden rounded-[1.75rem] border bg-card p-6 shadow-xs transition duration-300 hover:-translate-y-1 hover:shadow-lg md:col-span-2">
          <div
            aria-hidden="true"
            className="relative flex flex-1 items-center justify-center gap-2 rounded-2xl bg-muted/50 py-6"
            style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
          >
            {["Grocery", "Café", "Pharmacy"].map((kind, i) => (
              <span key={kind} className={cn("inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-sm", i === 1 && "-translate-y-3")}>
                <MapPinIcon className="size-3.5 text-primary" /> {kind}
              </span>
            ))}
          </div>
          <h3 className="mt-6 flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            Shops near you, with their prices <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Browse what they sell and get directions — no account needed.</p>
        </a>
      </div>

      <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-muted-foreground">
        Also built in: picking from your items · a photo of every mBoB or mPay transfer · overdue reminders · Insights · printable statements · a history nothing can erase.
      </p>
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
  const reduced = useReducedMotion()
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
    if (!playing || reduced) return
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
    <div className="grid flex-1 gap-3 sm:grid-cols-2">
      {/* The shop's side */}
      <div className="flex flex-col rounded-2xl border bg-background/60 p-4">
        <div className="text-xs font-medium text-muted-foreground">The shop's phone</div>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">T</span>
          <div className="text-left">
            <div className="text-sm font-semibold">Tashi Wangmo</div>
            <div className="text-xs text-muted-foreground">owes you</div>
          </div>
        </div>
        <div className="tabular mt-3 text-left text-3xl font-semibold tracking-tight text-owed">{ngultrum(balance)}</div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => tap("credit")}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-owed text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95"
          >
            <ArrowUpRightIcon className="size-4" /> Credit
          </button>
          <button
            type="button"
            onClick={() => tap("payment")}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-paid text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95"
          >
            <ArrowDownLeftIcon className="size-4" /> Payment
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">{playing && !reduced ? "Playing by itself — tap to try" : "Tap again"}</p>
        <DemoEntries entries={entries} />
      </div>

      {/* The customer's side */}
      <div className="flex flex-col rounded-2xl border bg-background/60 p-4">
        <div className="text-xs font-medium text-muted-foreground">Tashi's phone</div>
        <div key={latest.id} role="status" className="mt-3 flex items-start gap-2.5 rounded-xl border bg-card p-2.5 text-left shadow-md shadow-foreground/5 duration-500 animate-in fade-in slide-in-from-top-4">
          <LogoMark className="size-7 shrink-0" />
          <div className="min-w-0 text-xs leading-snug">
            <div className="truncate font-semibold">{latest.kind === "credit" ? "New credit · Karma General Shop" : "Payment · Karma General Shop"}</div>
            <div className="mt-0.5 truncate text-muted-foreground">
              {latest.what} · {ngultrum(latest.cents)}
            </div>
          </div>
        </div>
        <div className="mt-3 text-left text-xs text-muted-foreground">You owe Karma General Shop</div>
        <div key={balance} className="tabular text-left text-3xl font-semibold tracking-tight duration-500 animate-in fade-in zoom-in-95">
          {ngultrum(balance)}
        </div>
        <DemoEntries entries={entries} />
      </div>
    </div>
  )
}

/** The latest entries, as both phones list them: the same book on each. */
function DemoEntries({ entries }: { entries: Entry[] }) {
  return (
    <ul className="mt-4 grid gap-2 border-t pt-3 text-left">
      {entries.slice(0, 4).map((entry) => (
        <li key={entry.id} className="flex items-center gap-2 text-xs duration-500 animate-in fade-in">
          {entry.kind === "credit" ? <ArrowUpRightIcon className="size-3 text-owed" /> : <ArrowDownLeftIcon className="size-3 text-paid" />}
          <span className="min-w-0 flex-1 truncate">{entry.what}</span>
          <span className={cn("tabular font-semibold", entry.kind === "credit" ? "text-owed" : "text-paid")}>{ngultrum(entry.cents)}</span>
        </li>
      ))}
    </ul>
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

// ------------------------------------------------------------------ header

const SECTIONS = [
  ["Features", "features"],
  ["Pricing", "pricing"],
  ["Shops", "shops"],
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
    <section id="shops" className="scroll-mt-16 border-y bg-muted/40 py-20 sm:py-28">
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
