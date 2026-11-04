import { createFileRoute, Link } from "@tanstack/react-router"
import { WifiOffIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { usePage } from "@/lib/page"

export const Route = createFileRoute("/offline")({ component: Offline })

// Shown when a navigation fails with no cached copy.
function Offline() {
  usePage("Offline")
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-warn/10 text-warn">
        <WifiOffIcon className="size-7" />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">You are offline</h1>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">Bangkee could not reach the shop's books. Pages you have already opened still work.</p>
      <Link to="/" className={buttonVariants({ size: "lg", className: "mt-6 px-8" })}>
        Try again
      </Link>
    </div>
  )
}
