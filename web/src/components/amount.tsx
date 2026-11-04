import { DeleteIcon } from "lucide-react"

import { pressKey } from "@/lib/keypad"
import { cn } from "@/lib/utils"

// The amount field — the one input that must never be mistyped — and the
// on-screen keypad: thumb-sized keys beat a phone keyboard when entering
// money one-handed behind a counter.

export function AmountField({
  id,
  label,
  tone,
  value,
  onChange,
  autoFocus,
  children,
  name = "amount",
}: {
  id?: string
  label: string
  tone?: "credit" | "payment"
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  children?: React.ReactNode
  name?: string
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id ?? name} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <div
        className={cn(
          "flex items-baseline gap-2 rounded-2xl border bg-card px-4 py-3 shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40",
          tone === "credit" && "focus-within:border-owed/50 focus-within:ring-owed/15",
          tone === "payment" && "focus-within:border-paid/50 focus-within:ring-paid/15",
        )}
      >
        <span className="text-lg font-medium text-muted-foreground">Nu.</span>
        <input
          id={id ?? name}
          name={name}
          type="text"
          inputMode="decimal"
          placeholder="0"
          required
          autoFocus={autoFocus}
          aria-label="Amount in Ngultrum"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "tabular w-full min-w-0 bg-transparent text-4xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40",
            tone === "credit" && "text-owed",
            tone === "payment" && "text-paid",
          )}
        />
      </div>
      {children}
    </div>
  )
}

export function Keypad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"]
  const key = "tabular flex h-14 items-center justify-center rounded-xl bg-muted/70 text-xl font-medium transition-colors select-none hover:bg-muted active:scale-[0.98] active:bg-accent"
  return (
    <div className="keypad grid grid-cols-3 gap-2 md:hidden">
      {keys.map((k) => (
        <button key={k} type="button" className={key} onClick={() => onChange(pressKey(value, k))}>
          {k}
        </button>
      ))}
      <button type="button" aria-label="Delete" className={key} onClick={() => onChange(pressKey(value, "back"))}>
        <DeleteIcon className="size-5" />
      </button>
    </div>
  )
}
