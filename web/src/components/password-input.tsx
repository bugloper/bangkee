import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** A password (or PIN) field with an eye to show what was typed. */
export function PasswordInput({ className, what = "password", ...props }: Omit<React.ComponentProps<typeof Input>, "type"> & { what?: "password" | "PIN" }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-11", className)} />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? `Hide ${what}` : `Show ${what}`}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[inherit] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
      >
        {shown ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}
