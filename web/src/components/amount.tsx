import { cn } from "@/lib/utils"

// The amount field — the one input that must never be mistyped. Large type,
// and inputMode="decimal" so a phone opens its own number keyboard.

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
