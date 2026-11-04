import { ShieldAlertIcon } from "lucide-react"

import type { Me } from "@/api/types"
import { LogoMark } from "@/components/brand"
import { Button, buttonVariants } from "@/components/ui/button"
import { appOrigin } from "@/lib/host"
import { signOut } from "@/lib/session"

// Someone who is not staff, signed in on the console's address (a session
// from before the console had its own host). Nothing here is theirs.
export function StaffOnly({ me }: { me: Me }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <LogoMark className="size-10" />
      <span className="mt-8 flex size-12 items-center justify-center rounded-2xl bg-warn/10 text-warn">
        <ShieldAlertIcon className="size-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">That area is for Bangkee staff.</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">You are signed in as {me.user.email_address}. Your shop and your credit book are in the Bangkee app.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <a href={`${appOrigin()}/dashboard`} className={buttonVariants({ size: "lg" })}>
          Open Bangkee
        </a>
        <Button variant="outline" size="lg" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
