// The pieces a shop's catalog is drawn with, shared by the owner's Items
// screen and the shop page customers browse: the strip of category chips and
// an item's photo or its stand-in.

import { ImageIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface Chip {
  key: string
  label: string
  count?: number
}

/** One choice from a row of pills that scrolls sideways on a phone. */
export function Chips({ label, chips, value, onChange }: { label: string; chips: Chip[]; value: string; onChange: (key: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          role="radio"
          aria-checked={value === chip.key}
          onClick={() => onChange(chip.key)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            value === chip.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {chip.label}
          {chip.count !== undefined && <span className="tabular opacity-70">{chip.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** An item's photo, or a quiet placeholder where it has none. */
export function ItemThumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className={cn("shrink-0 rounded-xl object-cover", className)} />
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground/60", className)}>
      <ImageIcon className="size-4" />
    </span>
  )
}
