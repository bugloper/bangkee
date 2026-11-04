import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BellRingIcon,
  BookOpenIcon,
  CheckIcon,
  FileClockIcon,
  HistoryIcon,
  ImageIcon,
  type LucideIcon,
  MessageSquareWarningIcon,
  PrinterIcon,
  PackageIcon,
  ScrollTextIcon,
  ShoppingBasketIcon,
  SmartphoneIcon,
  TimerIcon,
  UsersIcon,
  WifiOffIcon,
  ZapIcon,
} from "lucide-react"

import { api } from "@/api/client"
import { Logo, LogoMark } from "@/components/brand"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ngultrum } from "@/lib/money"
import { usePage } from "@/lib/page"
import { cn } from "@/lib/utils"

// The front door at bangkee.bt for anyone not signed in: what the notebook
// costs a shop, what Bangkee does instead, and what it costs. The pictures
// are the app's own screens drawn in markup — no stock photography.

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8"
const YEAR = new Date().getFullYear()

export function Landing() {
  usePage(undefined)
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Preview />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}

// ------------------------------------------------------------------ header

const SECTIONS = [
  ["How it works", "how"],
  ["Features", "features"],
  ["Pricing", "pricing"],
  ["FAQ", "faq"],
] as const

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/65 [&:has(+main)]:border-border/60">
      <div className={cn(container, "flex h-16 items-center gap-6")}>
        <Link to="/" aria-label="Bangkee home">
          <Logo />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {SECTIONS.map(([label, id]) => (
            <a key={id} href={`#${id}`} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
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

// -------------------------------------------------------------------- hero

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.6_0.17_264/0.16),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)] bg-size-[56px_56px] opacity-40" />
      </div>
      <div className={cn(container, "grid items-center gap-14 pt-14 pb-20 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28")}>
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
            <span className="size-1.5 rounded-full bg-paid" />
            Made for shops in Bhutan
          </span>
          <h1 className="mt-6 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
            The credit book your shop <span className="text-primary">and your customers</span> share.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">
            Bangkee replaces the <em className="font-medium text-foreground not-italic">khata</em> behind the counter. Every credit and every payment is written once and seen by both sides — on their own phones, the moment it happens.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/registration/new" className={buttonVariants({ size: "xl" })}>
              Start free trial <ArrowRightIcon />
            </Link>
            <Link to="/session/new" className={buttonVariants({ size: "xl", variant: "outline" })}>
              Sign in
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {["14-day free trial", "No card needed", "Customers join free"].map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <CheckIcon className="size-4 text-paid" /> {point}
              </li>
            ))}
          </ul>
        </div>
        <HeroVisual />
      </div>
    </section>
  )
}

// One customer's page, as the owner's phone shows it, with the customer's
// side of the same moment beside it.
function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md select-none lg:mr-0">
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/15 via-transparent to-paid/10 blur-2xl" />
      <PhoneFrame>
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">T</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Tashi Wangmo</div>
            <div className="text-xs text-muted-foreground">Customer since March</div>
          </div>
        </div>
        <div className="px-4 pt-4">
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className="tabular mt-0.5 text-[2rem] leading-tight font-semibold tracking-tight text-owed">Nu. 4,250</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-owed text-xs font-semibold text-white">
              <ArrowUpRightIcon className="size-3.5" /> Credit
            </span>
            <span className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-paid text-xs font-semibold text-white">
              <ArrowDownLeftIcon className="size-3.5" /> Payment
            </span>
          </div>
        </div>
        <div className="mt-4 divide-y border-t">
          <MiniEntry kind="credit" title="Rice 25 kg, mustard oil" meta="Today · 3 items" amount="+ Nu. 2,150" balance="Nu. 4,250" />
          <MiniEntry kind="payment" title="Payment received" meta="Yesterday · mBoB" amount="− Nu. 1,000" balance="Nu. 2,100" />
          <MiniEntry kind="credit" title="Milk, eggs, bread" meta="12 Oct" amount="+ Nu. 640" balance="Nu. 3,100" />
          <MiniEntry kind="voided" title="Sugar 5 kg" meta="11 Oct · voided" amount="+ Nu. 310" />
        </div>
      </PhoneFrame>

      <div className="absolute -bottom-6 -left-4 w-60 rounded-2xl border bg-card/95 p-3.5 shadow-xl shadow-foreground/5 backdrop-blur sm:-left-12">
        <div className="flex items-start gap-3">
          <LogoMark className="size-8" />
          <div className="min-w-0 text-xs">
            <div className="font-semibold">Karma General Shop</div>
            <div className="mt-0.5 text-muted-foreground">
              Rice 25 kg, mustard oil · <span className="tabular font-medium text-owed">Nu. 2,150</span> added. Your balance is Nu. 4,250.
            </div>
          </div>
        </div>
      </div>

      <div className="absolute top-4 -right-16 hidden w-44 rounded-2xl sm:block xl:-right-20 border bg-card/95 p-3 shadow-xl shadow-foreground/5 backdrop-blur sm:-right-10">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-paid/10 text-paid">
            <ImageIcon className="size-3.5" />
          </span>
          Payment photo
        </div>
        <div className="mt-2 h-16 rounded-lg bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)]" />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="tabular font-semibold">Nu. 1,000</span>
          <span className="rounded-full bg-paid/10 px-1.5 py-0.5 text-[0.625rem] font-semibold text-paid">mBoB</span>
        </div>
      </div>
    </div>
  )
}

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-[18.5rem] rounded-[2.5rem] border bg-card p-2 shadow-2xl shadow-primary/10 ring-1 ring-foreground/5", className)}>
      <div className="overflow-hidden rounded-[2rem] border bg-background pb-3">
        <div className="flex h-7 items-center justify-center">
          <span className="h-1.5 w-16 rounded-full bg-muted" />
        </div>
        {children}
      </div>
    </div>
  )
}

function MiniEntry({ kind, title, meta, amount, balance }: { kind: "credit" | "payment" | "voided"; title: string; meta: string; amount: string; balance?: string }) {
  const Icon = kind === "payment" ? ArrowDownLeftIcon : ArrowUpRightIcon
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          kind === "credit" && "bg-owed/10 text-owed",
          kind === "payment" && "bg-paid/10 text-paid",
          kind === "voided" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-xs font-medium", kind === "voided" && "text-muted-foreground line-through")}>{title}</div>
        <div className="text-[0.6875rem] text-muted-foreground">{meta}</div>
      </div>
      <div className="text-right">
        <div className={cn("tabular text-xs font-semibold", kind === "credit" && "text-owed", kind === "payment" && "text-paid", kind === "voided" && "text-muted-foreground line-through")}>{amount}</div>
        {balance && <div className="tabular text-[0.625rem] text-muted-foreground">Bal {balance}</div>}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- problem

function SectionIntro({ eyebrow, title, children, center }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <div className="text-sm font-semibold text-primary">{eyebrow}</div>
      <h2 className="mt-3 text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">{children}</p>}
    </div>
  )
}

const PROBLEMS: [LucideIcon, string, string][] = [
  [BookOpenIcon, "Pages get lost, torn or smudged", "One spilled cup of suja and a month of credit is unreadable. When the notebook is gone, so is the record."],
  [MessageSquareWarningIcon, "Every disagreement is your word against theirs", "“I paid you last week.” With only the shop's copy, there is nothing both sides trust."],
  [SmartphoneIcon, "Customers never see what they owe", "They only find out at the counter, so the total always comes as a surprise — and surprises start arguments."],
  [TimerIcon, "Chasing overdue money is awkward", "You have to remember who is late, then bring it up in person. Most of the time it simply doesn't happen."],
]

function Problem() {
  return (
    <section className="border-y bg-muted/40 py-20 sm:py-28">
      <div className={container}>
        <SectionIntro eyebrow="The problem" title="The notebook behind the counter has served shops for generations. It also costs them.">
          Credit is how neighbourhood shops keep customers. But a handwritten khata only works as long as everyone remembers the same thing.
        </SectionIntro>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {PROBLEMS.map(([Icon, title, body]) => (
            <div key={title} className="rounded-2xl border bg-card p-6 shadow-xs">
              <span className="flex size-10 items-center justify-center rounded-xl bg-owed/10 text-owed">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------ how it works

const STEPS: [string, string][] = [
  ["Add your customers", "Type a name and phone number, then share their invite link by WhatsApp, SMS or however you talk. They join free."],
  ["Record as you go", "Tap Credit or Payment, enter the amount on the big keypad — or list the items. It takes a few seconds, even without signal."],
  ["Both sides stay in step", "The customer sees the new balance on their phone straight away. When they pay by mBoB or mPay, you photograph the payment screen with the payment."],
]

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 py-20 sm:py-28">
      <div className={container}>
        <SectionIntro eyebrow="How it works" title="Set up in an afternoon. Used in seconds a day." center />
        <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          <div aria-hidden="true" className="absolute top-5 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {STEPS.map(([title, body], index) => (
            <li key={title} className="relative text-center">
              <span className="tabular relative mx-auto flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-md ring-8 shadow-primary/25 ring-background">{index + 1}</span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- features

const FEATURES: [LucideIcon, string, string][] = [
  [ZapIcon, "A shared, real-time ledger", "One book, two views. What you record is what your customer sees — no copying, no catching up."],
  [ShoppingBasketIcon, "Itemized purchases", "Add the items, quantities and prices, and Bangkee does the sum. Customers see exactly what they took."],
  [ImageIcon, "A photo of every transfer", "When a customer shows you their mBoB or mPay screen, photograph it with the payment. Bangkee straightens it and keeps it on the record."],
  [PackageIcon, "Your items, a tap away", "List what you sell with prices and photos. Pick from them when you record a credit, and customers can browse them too."],
  [WifiOffIcon, "Works offline", "No signal? Keep recording. Entries wait safely on the phone and send themselves when you're back online."],
  [BellRingIcon, "Push notifications", "Customers hear about every new entry. You hear when a customer joins and when balances run late."],
  [PrinterIcon, "Printable statements", "The whole account on one clean page — every entry, totals and balance — ready to print or save as a PDF."],
  [FileClockIcon, "Overdue reminders", "Late balances are flagged on your home screen, and both you and the customer get a reminder — so you don't have to bring it up."],
  [HistoryIcon, "A full audit trail", "Nothing is ever deleted. A mistake is voided, struck through and logged — the history stays honest."],
]

function Features() {
  return (
    <section id="features" className="scroll-mt-16 border-t bg-muted/40 py-20 sm:py-28">
      <div className={container}>
        <SectionIntro eyebrow="Features" title="Everything the notebook did — and everything it couldn't.">
          Built for the counter: big buttons, few taps, and figures you can read at a glance.
        </SectionIntro>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border shadow-xs sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([Icon, title, body]) => (
            <div key={title} className="bg-card p-6">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                <Icon className="size-[1.125rem]" />
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
          <div className="flex flex-col justify-center bg-card p-6 sm:col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UsersIcon className="size-4 text-primary" /> Customers are always free
            </div>
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-muted-foreground">They see their balance at every shop they use, get notified of new entries, and browse shops — without paying anything.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------- preview

// The owner's home screen on a wide display: today's figures and who to
// call about money.
function Preview() {
  const overdue: [string, string, string][] = [
    ["Pema Choden", "41 days overdue", "Nu. 6,800"],
    ["Sonam Tobgay", "33 days overdue", "Nu. 2,450"],
    ["Ugyen Lhamo", "30 days overdue", "Nu. 1,120"],
  ]
  return (
    <section className="py-20 sm:py-28">
      <div className={container}>
        <SectionIntro eyebrow="On a bigger screen" title="Your whole book, at a glance." center>
          Open Bangkee on the shop's computer or tablet and it lays itself out for the bigger screen.
        </SectionIntro>
        <div aria-hidden="true" className="relative mx-auto mt-14 max-w-5xl select-none">
          <div className="absolute -inset-x-10 -inset-y-8 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,oklch(0.6_0.17_264/0.14),transparent)]" />
          <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-foreground/10">
            <div className="flex h-9 items-center gap-1.5 border-b bg-muted/50 px-4">
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="mx-auto rounded-md bg-background px-10 py-0.5 text-[0.6875rem] text-muted-foreground">bangkee.bt</span>
            </div>
            <div className="grid md:grid-cols-[13rem_1fr]">
              <div className="hidden border-r bg-sidebar p-3 md:block">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <LogoMark className="size-6" />
                  <span className="text-xs font-semibold">Karma General Shop</span>
                </div>
                <div className="mt-3 grid gap-0.5 text-xs font-medium">
                  {["Home", "Customers", "Items", "Settings"].map((item, index) => (
                    <div key={item} className={cn("flex items-center justify-between rounded-md px-2 py-1.5", index === 0 ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 p-4 sm:p-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <MiniStat label="Outstanding credit" value="Nu. 84,310" />
                  <MiniStat label="Repaid this month" value="Nu. 31,900" tone="paid" />
                  <MiniStat label="Overdue accounts" value="3" tone="owed" />
                  <MiniStat label="Customers" value="48" />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border">
                    <div className="border-b px-4 py-2.5 text-xs font-semibold">Overdue balances</div>
                    {overdue.map(([name, late, amount]) => (
                      <div key={name} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
                        <span className="flex size-7 items-center justify-center rounded-full bg-owed/10 text-[0.6875rem] font-semibold text-owed">{name.charAt(0)}</span>
                        <div className="flex-1">
                          <div className="text-xs font-medium">{name}</div>
                          <div className="text-[0.6875rem] text-warn">{late}</div>
                        </div>
                        <span className="tabular text-xs font-semibold text-owed">{amount}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border">
                    <div className="border-b px-4 py-2.5 text-xs font-semibold">Recent activity</div>
                    <MiniEntry kind="payment" title="Payment · Dawa Zangmo" meta="2 minutes ago" amount="− Nu. 1,500" />
                    <MiniEntry kind="credit" title="Credit · Tashi Wangmo" meta="18 minutes ago" amount="+ Nu. 2,150" />
                    <MiniEntry kind="credit" title="Credit · Kinley Dorji" meta="1 hour ago" amount="+ Nu. 380" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "owed" | "paid" | "warn" }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-[0.6875rem] text-muted-foreground">{label}</div>
      <div className={cn("tabular mt-1 text-lg font-semibold tracking-tight", tone === "owed" && "text-owed", tone === "paid" && "text-paid", tone === "warn" && "text-warn")}>{value}</div>
    </div>
  )
}

// ----------------------------------------------------------------- pricing

const INCLUDED = [
  "Unlimited customers and entries",
  "Itemized credits, picked from your items",
  "A photo of every mBoB or mPay transfer",
  "Your shop listed for customers to browse",
  "Offline recording and push notifications",
  "Printable statements and the full audit trail",
]

function Pricing() {
  const { data } = useQuery({ queryKey: ["pricing"], queryFn: api.pricing, staleTime: Infinity })
  return (
    <section id="pricing" className="scroll-mt-16 border-t bg-muted/40 py-20 sm:py-28">
      <div className={container}>
        <SectionIntro eyebrow="Pricing" title="One plan. Everything included." center>
          No tiers to compare and no add-ons. Your customers never pay a thing.
        </SectionIntro>
        <div className="mx-auto mt-12 grid max-w-4xl gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl border bg-card p-7 shadow-lg shadow-primary/5 ring-1 ring-primary/10 sm:p-9">
            <div aria-hidden="true" className="absolute -top-24 -right-24 size-64 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold tracking-tight">Bangkee for shops</h3>
                {data && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">{data.trial_days}-day free trial</span>}
              </div>
              {data ? (
                <>
                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span className="tabular text-5xl font-semibold tracking-[-0.03em]">{ngultrum(data.monthly_price_cents)}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Billed annually — <span className="tabular font-medium text-foreground">{ngultrum(data.annual_price_cents)}</span> per year.
                  </p>
                </>
              ) : (
                <div className="mt-6 grid gap-3" aria-label="Loading prices">
                  <Skeleton className="h-12 w-52" />
                  <Skeleton className="h-4 w-60" />
                </div>
              )}
              <Link to="/registration/new" className={buttonVariants({ size: "xl", className: "mt-7 w-full" })}>
                Start your free trial <ArrowRightIcon />
              </Link>
              <p className="mt-3 text-center text-xs text-muted-foreground">{data ? `${data.trial_days} days free` : "Free to start"} · No card needed · Pay by bank transfer when you're ready</p>
              <div className="mt-7 border-t pt-6">
                <div className="text-sm font-semibold">Everything included</div>
                <ul className="mt-3 grid gap-2.5 text-sm">
                  {INCLUDED.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-paid/15 text-paid">
                        <CheckIcon className="size-3" strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="flex flex-col rounded-3xl border bg-card p-7 shadow-xs sm:p-9">
            <span className="flex size-10 items-center justify-center rounded-xl bg-paid/10 text-paid">
              <UsersIcon className="size-5" />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight">Customers</h3>
            <div className="mt-2 text-3xl font-semibold tracking-tight">Always free</div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Anyone you invite gets their own account: their balance at every shop they use, a note when something is added, and shops to browse.
            </p>
            <div className="mt-auto pt-6">
              <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-3 text-sm">
                <ScrollTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">If a shop's subscription lapses, its customers can still read their balances.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// --------------------------------------------------------------------- faq

function Faq() {
  const { data } = useQuery({ queryKey: ["pricing"], queryFn: api.pricing, staleTime: Infinity })
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
      "Add the customer, then share the invite link Bangkee gives you — by WhatsApp, SMS or however you usually talk. They create a free account and see their balance straight away.",
    ],
    [
      "How do I pay for Bangkee?",
      `By bank transfer. From Billing in the app, transfer ${annual} to Bangkee's account and attach the screenshot. We check it and approve it, usually within one working day.`,
    ],
    [
      "Do I need to install an app?",
      "No app store needed. Bangkee opens in any phone browser, and you can add it to your home screen so it opens like an app, with notifications.",
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

function SiteFooter() {
  return (
    <footer className="border-t">
      <div className={cn(container, "flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between")}>
        <div>
          <Logo />
          <p className="mt-2 text-sm text-muted-foreground">The shared credit book for shops in Bhutan.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <a href="#pricing" className="hover:text-foreground">
            Pricing
          </a>
          <a href="#faq" className="hover:text-foreground">
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
