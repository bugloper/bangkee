import { useId, useState } from "react"

import { cn } from "@/lib/utils"

// Series over time as filled areas, in plain SVG: soft gradients under 2px
// lines, three recessive gridlines, and a crosshair with every series'
// figure for whichever point the pointer (or the arrow keys) is on. With
// more than one series the caller shows a legend; colour is never the only
// way to tell them apart, as the tooltip names each one.

export interface Series {
  key: string
  label: string
  color: string // a CSS colour, usually a theme variable
  values: number[]
}

function niceCeiling(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power
  return 10 * power
}

export function AreaChart({
  labels,
  series,
  format,
  axis,
  label,
  className,
  height = 240,
}: {
  labels: string[] // one per point: what the tooltip and the x-axis say
  series: Series[]
  format: (value: number) => string
  axis: (value: number) => string
  label: string
  className?: string
  height?: number
}) {
  const id = useId().replace(/:/g, "")
  const [hover, setHover] = useState<number | null>(null)
  const count = labels.length
  const width = 720
  const pad = { top: 12, right: 8, bottom: 26, left: 40 }
  const top = niceCeiling(Math.max(0, ...series.flatMap((s) => s.values)))
  const x = (i: number) => pad.left + (count <= 1 ? 0 : (i / (count - 1)) * (width - pad.left - pad.right))
  const y = (v: number) => pad.top + (1 - v / top) * (height - pad.top - pad.bottom)
  const ticks = [0, 0.5, 1].map((share) => top * share)
  const every = Math.ceil(count / 6)
  const shown = hover ?? count - 1

  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible outline-none"
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setHover(Math.max(0, shown - 1))
          if (event.key === "ArrowRight") setHover(Math.min(count - 1, shown + 1))
        }}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const at = ((event.clientX - box.left) / box.width) * width
          const i = Math.round(((at - pad.left) / (width - pad.left - pad.right)) * (count - 1))
          setHover(Math.max(0, Math.min(count - 1, i)))
        }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${id}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.24" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : "3 4"} />
            <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {axis(tick)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path key={`a-${s.key}`} d={`${path(s.values)} L${x(count - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`} fill={`url(#fill-${id}-${s.key})`} />
        ))}
        {series.map((s) => (
          <path key={`l-${s.key}`} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {labels.map((text, i) =>
          i % every === 0 || i === count - 1 ? (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === count - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
              {text}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(0)} stroke="var(--muted-foreground)" strokeOpacity="0.45" />}
        {series.map((s) => (
          <circle key={`d-${s.key}`} cx={x(shown)} cy={y(s.values[shown] ?? 0)} r="4" fill={s.color} stroke="var(--card)" strokeWidth="2" />
        ))}
      </svg>
      {hover !== null && (
        <div
          className="tabular pointer-events-none absolute top-0 min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs whitespace-nowrap shadow-md"
          style={{ left: `${(x(shown) / width) * 100}%`, transform: `translateX(${shown > count / 2 ? "calc(-100% - 10px)" : "10px"})` }}
        >
          <div className="mb-1 font-medium">{labels[shown]}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-medium">{format(s.values[shown] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** A figure's shape over the period, with no axes: the card beside it carries the numbers. */
export function Sparkline({ values, color = "var(--primary)", className }: { values: number[]; color?: string; className?: string }) {
  const id = useId().replace(/:/g, "")
  const width = 120
  const height = 36
  const top = Math.max(1, ...values)
  const x = (i: number) => (values.length <= 1 ? 0 : (i / (values.length - 1)) * width)
  const y = (v: number) => 2 + (1 - v / top) * (height - 4)
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("h-9 w-full", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
