import { CircleAlertIcon } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { pluralize } from "@/lib/money"
import { cn } from "@/lib/utils"

/** "2 problems stopped this from saving:" — every problem at once, not one per submit. */
export function ErrorBox({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3.5 text-sm">
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div>
        <p className="font-medium text-destructive">{pluralize(errors.length, "problem")} stopped this from saving:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/80">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  srOnly,
  className,
}: {
  label: string
  hint?: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
  srOnly?: boolean
  className?: string
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className={cn("flex items-baseline justify-between gap-3", srOnly && "sr-only")}>
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** A choice of a few named options — how they paid, say. */
export function Segmented<T extends string>({
  name,
  options,
  value,
  onChange,
  label,
}: {
  name: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
      {options.map((option) => (
        <label
          key={option}
          className={cn(
            "relative flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors select-none",
            "has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-checked:ring-1 has-checked:ring-foreground/5",
            "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          )}
        >
          <input type="radio" className="sr-only" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
          {option}
        </label>
      ))}
    </div>
  )
}

export function Check({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (checked: boolean) => void; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg py-1 text-sm">
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)} className="mt-0.5" />
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  )
}

/** The loading state for a whole screen. */
export function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-14 rounded-xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  )
}

/** The bottom of a form: the main action, and the quiet ways out. */
export function FormActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end", className)}>{children}</div>
}
