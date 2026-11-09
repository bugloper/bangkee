import { useId, useState } from "react"

import { cn } from "@/lib/utils"

// One series over time as a filled area, in plain SVG: a soft gradient
// under a 2px line, three recessive gridlines, and a crosshair with the
// figure for whichever point the pointer (or keyboard) is on.

export interface AreaPoint {
  key: string
  label: string // the x-axis label
  value: number
  detail?: string // a second line for the tooltip
}

function niceCeiling(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power
  return 10 * power
}

export function AreaChart({ points, format, axis, label, className }: { points: AreaPoint[]; format: (value: number) => string; axis: (value: number) => string; label: string; className?: string }) {
  const id = useId().replace(/:/g, "")
  const [hover, setHover] = useState<number | null>(null)
  const width = 640
  const height = 220
  const pad = { top: 12, right: 8, bottom: 26, left: 44 }
  const top = niceCeiling(Math.max(...points.map((p) => p.value)))
  const x = (i: number) => pad.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * (width - pad.left - pad.right))
  const y = (v: number) => pad.top + (1 - v / top) * (height - pad.top - pad.bottom)
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  const ticks = [0, 0.5, 1].map((share) => top * share)
  const shown = hover ?? points.length - 1
  const every = Math.ceil(points.length / 6)

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setHover(Math.max(0, shown - 1))
          if (event.key === "ArrowRight") setHover(Math.min(points.length - 1, shown + 1))
        }}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const at = ((event.clientX - box.left) / box.width) * width
          const i = Math.round(((at - pad.left) / (width - pad.left - pad.right)) * (points.length - 1))
          setHover(Math.max(0, Math.min(points.length - 1, i)))
        }}
      >
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : "3 4"} />
            <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {axis(tick)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#fill-${id})`} />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={p.key} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
              {p.label}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(0)} stroke="var(--muted-foreground)" strokeOpacity="0.5" />}
        <circle cx={x(shown)} cy={y(points[shown].value)} r="4.5" fill="var(--primary)" stroke="var(--card)" strokeWidth="2" />
      </svg>
      <div
        className="tabular pointer-events-none absolute top-0 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
        style={{ left: `${(x(shown) / width) * 100}%`, transform: `translateX(${shown > points.length / 2 ? "-105%" : "5%"})` }}
      >
        <div className="text-muted-foreground">{points[shown].label}</div>
        <div className="font-semibold">{format(points[shown].value)}</div>
        {points[shown].detail && <div className="text-muted-foreground">{points[shown].detail}</div>}
      </div>
    </div>
  )
}
