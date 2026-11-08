import { useId } from "react"

import { cn } from "@/lib/utils"

/**
 * The mark: a lowercase b whose bowl is a ruled page with two entries on it —
 * the credit book — on the brand indigo. public/icon.svg is the same drawing.
 */
export function LogoMark({ className }: { className?: string }) {
  // Each mark its own gradient: a url(#id) that points into a hidden copy
  // (the sidebar on a phone) paints nothing.
  const gradient = useId()
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4d35f1" />
          <stop offset="1" stopColor="#4774f6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <path d="M9.4 8a2 2 0 0 1 4 0v4.6h4.4a6.6 6.6 0 0 1 0 13.2H11.4a2 2 0 0 1-2-2z" fill="#fff" />
      <rect x="13.6" y="16.6" width="6.6" height="1.7" rx=".85" fill="#4d35f1" />
      <rect x="13.6" y="20.2" width="4.4" height="1.7" rx=".85" fill="#4d35f1" fillOpacity=".55" />
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
