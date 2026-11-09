// The days a statement covers: the quick choices, and how a range reads.

import type { StatementRange } from "@/api/client"
import { longDate } from "@/lib/time"

export const PRESETS = ["This month", "Last month", "3 months", "Everything", "Pick dates"] as const
type Preset = (typeof PRESETS)[number]

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export function presetRange(preset: Preset): StatementRange {
  const now = new Date()
  const first = (offset: number) => new Date(now.getFullYear(), now.getMonth() + offset, 1)
  switch (preset) {
    case "This month":
      return { from: ymd(first(0)) }
    case "Last month":
      return { from: ymd(first(-1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) }
    case "3 months":
      return { from: ymd(first(-2)) }
    default:
      return {}
  }
}

export function presetOf(range: StatementRange): Preset {
  for (const preset of PRESETS.slice(0, 4)) {
    const candidate = presetRange(preset)
    if (candidate.from === range.from && candidate.to === range.to) return preset
  }
  return "Pick dates"
}

export function rangeLabel(range: StatementRange): string {
  if (range.from && range.to) return `${longDate(range.from + "T00:00")} – ${longDate(range.to + "T00:00")}`
  if (range.from) return `Since ${longDate(range.from + "T00:00")}`
  if (range.to) return `Up to ${longDate(range.to + "T00:00")}`
  return "Every entry"
}
