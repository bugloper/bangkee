import { PasswordInput } from "@/components/password-input"
import { cn } from "@/lib/utils"

/** Four digits, a number pad on a phone, the dots of a password. */
export function PinInput({
  id,
  value,
  onChange,
  autoFocus,
  fresh,
  className,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  /** Choosing a PIN rather than typing one: a password manager offers to save it. */
  fresh?: boolean
  className?: string
}) {
  return (
    <PasswordInput
      id={id}
      what="PIN"
      inputMode="numeric"
      pattern="[0-9]{4}"
      maxLength={4}
      required
      autoFocus={autoFocus}
      autoComplete={fresh ? "new-password" : "current-password"}
      placeholder="••••"
      title="4 digits"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
      className={cn("tabular h-12 pl-11 text-center text-2xl tracking-[0.6em]", className)}
    />
  )
}
