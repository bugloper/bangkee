import { useId } from "react"

import { cn } from "@/lib/utils"

/** The mark: a "B" drawn as two ledger tabs, on the brand blue. */
export function LogoMark({ className }: { className?: string }) {
  // Each mark its own gradient: a url(#id) that points into a hidden copy
  // (the sidebar on a phone) paints nothing.
  const gradient = useId()
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.55 0.18 264)" />
          <stop offset="1" stopColor="oklch(0.4 0.16 266)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <path d="M10 8.5h7.2a3.8 3.8 0 0 1 0 7.6H10z" fill="#fff" />
      <path d="M10 16.1h8.4a3.7 3.7 0 0 1 0 7.4H10z" fill="#fff" fillOpacity="0.72" />
    </svg>
  )
}

export function Logo({ className, sub }: { className?: string; sub?: React.ReactNode }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[0.9375rem] font-semibold tracking-tight">Bangkee</span>
        {sub && <span className="block max-w-40 truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
    </span>
  )
}
