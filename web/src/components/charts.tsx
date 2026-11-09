import { useState } from "react"

import { ngultrum } from "@/lib/money"
import { cn } from "@/lib/utils"

// The two charts Insights draws, in plain SVG and HTML: no chart library for
// a bar chart and a ring.

// ---------------------------------------------------------------- bar chart

export interface Bar {
  key: string
  label: string
  cents: number
}

/** A round number just above the largest bar, so the top gridline means something. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * power >= value) return step * power
  }
  return 10 * power
}

/** Short money for an axis: Nu. 2k, Nu. 1.5k, Nu. 800. */
function axisMoney(cents: number): string {
  const nu = cents / 100
  if (nu >= 1000) return `${Number((nu / 1000).toFixed(1))}k`
  return String(Math.round(nu))
}

/**
 * Months as bars: the chosen one in the brand colour, the rest grey. A bar
 * is a button — tapping one chooses its month. Hovering shows the figure.
 */
export function MonthBars({ bars, selected, onSelect, label }: { bars: Bar[]; selected: string; onSelect: (key: string) => void; label: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const top = niceCeiling(Math.max(...bars.map((bar) => bar.cents)))
  const ticks = [1, 0.75, 0.5, 0.25].map((share) => top * share)

  return (
    <div className="grid grid-cols-[2.5rem_1fr] gap-x-2">
      {/* The axis and its dashed lines, behind the bars. */}
      <div className="relative h-44">
        {ticks.map((tick) => (
          <span key={tick} className="tabular absolute right-0 -translate-y-1/2 text-xs text-muted-foreground" style={{ top: `${(1 - tick / top) * 100}%` }}>
            {axisMoney(tick)}
          </span>
        ))}
      </div>
      <div role="radiogroup" aria-label={label} className="relative flex h-44 items-end gap-2 sm:gap-3">
        {ticks.map((tick) => (
          <span key={tick} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${(1 - tick / top) * 100}%` }} />
        ))}
        {bars.map((bar) => {
          const chosen = bar.key === selected
          return (
            <button
              key={bar.key}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={`${bar.label}: ${ngultrum(bar.cents)}`}
              onClick={() => onSelect(bar.key)}
              onPointerEnter={() => setHover(bar.key)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(bar.key)}
              onBlur={() => setHover(null)}
              className="relative z-10 flex h-full flex-1 items-end focus-visible:outline-none"
            >
              <span
                className={cn(
                  "block w-full rounded-t-[4px] transition-colors",
                  chosen ? "bg-gradient-to-b from-[color-mix(in_oklch,var(--primary),white_25%)] to-primary" : "bg-[var(--bar)] hover:bg-[color-mix(in_oklch,var(--bar),var(--foreground)_8%)]",
                )}
                style={{ height: `${Math.max(bar.cents > 0 ? 2 : 0, (bar.cents / top) * 100)}%` }}
              />
              {hover === bar.key && (
                <span className="tabular pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background shadow-md">
                  {ngultrum(bar.cents)}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div />
      <div className="mt-2 flex gap-2 sm:gap-3">
        {bars.map((bar) => (
          <span key={bar.key} className={cn("flex-1 text-center text-xs", bar.key === selected ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------- ring

export interface Slice {
  key: string
  label: string
  cents: number
  color: string
}

/** Slices whose share is at least this get their percentage beside them. */
const LABEL_FROM = 0.04

/**
 * A ring of shares, with whatever the caller puts in its middle. Each
 * share's percentage sits outside it; hovering one names it.
 */
export function Ring({ slices, children, label }: { slices: Slice[]; children?: React.ReactNode; label: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const total = slices.reduce((sum, slice) => sum + slice.cents, 0)
  const size = 260
  const radius = 96
  const stroke = 24
  const circumference = 2 * Math.PI * radius
  const gap = slices.length > 1 ? 6 : 0 // a little air between slices, on the surface colour

  const shares = slices.map((slice) => (total > 0 ? slice.cents / total : 0))
  const arcs = slices.map((slice, i) => ({ slice, share: shares[i], start: shares.slice(0, i).reduce((sum, s) => sum + s, 0) }))
  const hovered = arcs.find((arc) => arc.slice.key === hover)

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[17rem]">
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" role="img" aria-label={label}>
        {arcs.map(({ slice, share, start }) => {
          const length = Math.max(0, share * circumference - gap)
          return (
            <circle
              key={slice.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={hover === slice.key ? stroke + 4 : stroke}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-(start * circumference + gap / 2)}
              className="cursor-default transition-[stroke-width]"
              onPointerEnter={() => setHover(slice.key)}
              onPointerLeave={() => setHover(null)}
            >
              <title>{`${slice.label}: ${ngultrum(slice.cents)} (${Math.round(share * 100)}%)`}</title>
            </circle>
          )
        })}
      </svg>
      {/* Percentages outside the ring, at each slice's middle. */}
      {arcs.map(({ slice, share, start }) => {
        if (share < LABEL_FROM) return null
        const angle = (start + share / 2) * 2 * Math.PI - Math.PI / 2
        const r = (radius + stroke / 2 + 16) / size
        return (
          <span
            key={slice.key}
            aria-hidden="true"
            className="tabular pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-xs font-semibold"
            style={{ left: `${(0.5 + r * Math.cos(angle)) * 100}%`, top: `${(0.5 + r * Math.sin(angle)) * 100}%` }}
          >
            {Math.round(share * 100)}%
          </span>
        )
      })}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
      {hovered && (
        <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium whitespace-nowrap text-background shadow-md">
          {hovered.slice.label} · {Math.round(hovered.share * 100)}%
        </span>
      )}
    </div>
  )
}

/** The key under a ring: a swatch and a name for each slice. */
export function RingLegend({ slices }: { slices: Slice[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border p-3 text-sm sm:grid-cols-3">
      {slices.map((slice) => (
        <li key={slice.key} className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="size-3 shrink-0 rounded-[3px]" style={{ background: slice.color }} />
          <span className="truncate">{slice.label}</span>
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------ day bars

export interface DayBar {
  day: string // YYYY-MM-DD
  cents: number
  /** A second figure the tooltip mentions beside the bar's own. */
  aside?: string
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayLabel = (day: string) => `${Number(day.slice(8, 10))} ${SHORT_MONTHS[Number(day.slice(5, 7)) - 1]}`

/**
 * One figure a day, today last — the dashboard's collections. Only the first
 * day, the middle and today are labelled; hovering or focusing a day shows
 * its figure.
 */
export function DayBars({ bars, label }: { bars: DayBar[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const top = niceCeiling(Math.max(...bars.map((bar) => bar.cents)))
  const labelled = new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1])

  return (
    <div role="group" aria-label={label}>
      <div className="relative flex h-32 items-end gap-0.5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <span aria-hidden="true" className="tabular absolute -top-2.5 right-0 bg-card pl-1 text-[0.6875rem] text-muted-foreground">
          {axisMoney(top)}
        </span>
        {bars.map((bar, i) => (
          <button
            key={bar.day}
            type="button"
            aria-label={`${dayLabel(bar.day)}: ${ngultrum(bar.cents)}${bar.aside ? `, ${bar.aside}` : ""}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="relative z-10 flex h-full flex-1 cursor-default items-end focus-visible:outline-none"
          >
            <span
              className={cn("block w-full rounded-t-[4px] transition-colors", hover === i ? "bg-paid" : "bg-paid/70", i === bars.length - 1 && "bg-paid")}
              style={{ height: `${Math.max(bar.cents > 0 ? 3 : 0, (bar.cents / top) * 100)}%` }}
            />
            {hover === i && (
              <span
                className={cn(
                  "tabular pointer-events-none absolute -top-12 z-20 rounded-md bg-foreground px-2 py-1 text-left text-xs whitespace-nowrap text-background shadow-md",
                  i < bars.length / 2 ? "left-0" : "right-0",
                )}
              >
                <span className="block font-medium">
                  {dayLabel(bar.day)} · {ngultrum(bar.cents)}
                </span>
                {bar.aside && <span className="block opacity-75">{bar.aside}</span>}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-0.5">
        {bars.map((bar, i) => (
          <span key={bar.day} className="flex-1 text-center text-[0.6875rem] whitespace-nowrap text-muted-foreground">
            {labelled.has(i) ? (i === bars.length - 1 ? "Today" : dayLabel(bar.day)) : ""}
          </span>
        ))}
      </div>
    </div>
  )
}
