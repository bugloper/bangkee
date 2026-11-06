// The handful of building blocks every screen is made of: surfaces, rows,
// numbers and the empty state. Built on the shadcn primitives so the whole
// app shares one set of radii, borders and type.

import { ChevronRightIcon, type LucideIcon } from "lucide-react"

import { AppLink } from "@/components/app-link"
import { balanceState, ngultrum } from "@/lib/money"
import { cn } from "@/lib/utils"

// ------------------------------------------------------------------ surfaces

/** A card. `flush` drops the padding for lists that run edge to edge. */
export function Panel({
  title,
  description,
  action,
  footer,
  flush,
  className,
  children,
  id,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  footer?: React.ReactNode
  flush?: boolean
  className?: string
  children?: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className={cn("overflow-hidden rounded-[1.25rem] border bg-card text-card-foreground", className)}>
      {(title || action) && (
        <header className={cn("flex items-start justify-between gap-3 px-4 pt-4 sm:px-5", flush ? "pb-3" : "pb-0")}>
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children !== undefined && <div className={cn(!flush && "p-4 sm:p-5", flush && (title || action) && "border-t")}>{children}</div>}
      {footer && <footer className="border-t bg-muted/40 px-4 py-3 text-sm sm:px-5">{footer}</footer>}
    </section>
  )
}

/** A divided list inside a flush panel. */
export function Rows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y", className)}>{children}</div>
}

/**
 * One line of a list: something to recognise it by, a title and a line
 * under it, and whatever belongs at the end. A link when it has an href.
 */
export function Row({
  href,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  className,
  dimmed,
}: {
  href?: string
  onClick?: () => void
  leading?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
  chevron?: boolean
  className?: string
  dimmed?: boolean
}) {
  const body = (
    <>
      {leading}
      <div className={cn("min-w-0 flex-1", dimmed && "opacity-60")}>
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">{subtitle}</div>}
      </div>
      {trailing && <div className="flex shrink-0 flex-col items-end gap-1 text-right">{trailing}</div>}
      {chevron && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60" />}
    </>
  )
  const classes = cn("flex min-h-15 items-center gap-3 px-4 py-3 sm:px-5", (href || onClick) && "transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none", className)
  if (href) {
    return (
      <AppLink href={href} className={classes}>
        {body}
      </AppLink>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "w-full text-left")}>
        {body}
      </button>
    )
  }
  return <div className={classes}>{body}</div>
}

// ------------------------------------------------------------------ numbers

const TONE = {
  owed: "text-owed",
  paid: "text-paid",
  settled: "text-muted-foreground",
  neutral: "",
} as const

/**
 * An amount in Ngultrum, in tabular figures. `tone="auto"` reads a balance:
 * owed red, in credit green, settled grey.
 */
export function Money({ cents, signed, tone = "neutral", className }: { cents: number | null | undefined; signed?: boolean; tone?: keyof typeof TONE | "auto"; className?: string }) {
  const resolved = tone === "auto" ? balanceState(cents ?? 0) : tone
  return <span className={cn("tabular font-medium whitespace-nowrap", TONE[resolved], className)}>{ngultrum(cents, signed)}</span>
}

/** A figure with its label, for the rows of numbers on dashboards. */
export function Stat({ label, value, tone, href, hint }: { label: string; value: React.ReactNode; tone?: "owed" | "paid" | "warn"; href?: string; hint?: React.ReactNode }) {
  const body = (
    <>
      <div className="text-[0.8125rem] font-medium text-muted-foreground">{label}</div>
      <div className={cn("tabular mt-1.5 text-2xl font-semibold tracking-tight", tone === "owed" && "text-owed", tone === "paid" && "text-paid", tone === "warn" && "text-warn")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </>
  )
  const classes = "block rounded-[1.25rem] border bg-card p-4"
  return href ? (
    <AppLink href={href} className={cn(classes, "transition-colors hover:bg-muted/40")}>
      {body}
    </AppLink>
  ) : (
    <div className={classes}>{body}</div>
  )
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</div>
}

/** The large balance at the top of an account. */
export function BigAmount({ label, cents, tone = "auto", aside }: { label: React.ReactNode; cents: number; tone?: "auto" | "neutral"; aside?: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <Money cents={cents} tone={tone} className="text-4xl font-semibold tracking-tight" />
        {aside}
      </div>
    </div>
  )
}

/** A label and a value on one line — bank details, totals. */
export function KV({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

// ------------------------------------------------------------------- people

/** A round initial standing in for a person, a shop or a table. */
/** Someone's or a shop's photo when there is one, its first letter when not. */
export function Initial({ text, size = "md", tone = "brand", src }: { text: string; size?: "sm" | "md" | "lg" | "xl"; tone?: "brand" | "owed" | "muted"; src?: string | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
        size === "sm" && "size-8 text-xs",
        size === "md" && "size-10 text-sm",
        size === "lg" && "size-12 text-base",
        size === "xl" && "size-16 text-2xl",
        tone === "brand" && "bg-accent text-accent-foreground",
        tone === "owed" && "bg-owed/10 text-owed",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover" /> : text.charAt(0).toUpperCase()}
    </span>
  )
}

// -------------------------------------------------------------------- notes

/** Nothing to show yet, and what would make something appear. */
export function Empty({ icon: IconComponent, title, children, action, className }: { icon?: LucideIcon; title?: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {IconComponent && (
        <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <IconComponent className="size-5" />
        </span>
      )}
      {title && <div className="text-sm font-semibold">{title}</div>}
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** A sentence of guidance beside a form or list. */
export function Note({ children, tone = "info", icon: IconComponent, className }: { children: React.ReactNode; tone?: "info" | "warn"; icon?: LucideIcon; className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-relaxed",
        tone === "info" && "bg-accent/60 text-accent-foreground",
        tone === "warn" && "bg-warn/10 text-foreground",
        className,
      )}
    >
      {IconComponent && <IconComponent className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-warn" : "")} />}
      <div>{children}</div>
    </div>
  )
}

/** The small grey heading over a group of panels. */
export function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
      {action}
    </div>
  )
}

/** A screen's own heading where the topbar title is not enough — a page with actions. */
export function PageHeading({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** A pill-shaped count beside a heading. */
export function Count({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "brand" | "owed" }) {
  return (
    <span
      className={cn(
        "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "brand" && "bg-primary text-primary-foreground",
        tone === "owed" && "bg-owed text-white",
      )}
    >
      {children}
    </span>
  )
}

// ------------------------------------------------------------------ filters

/** The strip of filters over a list: a black pill marks the one in use. */
export function FilterTabs({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={label} className="flex w-full gap-1 overflow-x-auto rounded-full border bg-card p-1 sm:w-fit">
      {children}
    </nav>
  )
}
