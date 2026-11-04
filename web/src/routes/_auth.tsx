import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { CheckIcon } from "lucide-react"

import { FlashBanners, OfflineBanner } from "@/components/banners"
import { Logo } from "@/components/brand"
import { isAdminHost } from "@/lib/host"

// Signing in, signing up, resetting a password, and the invite landing: no
// shell. On a wide screen the form shares the page with a word about what
// Bangkee is; on a phone it is just the form.
export const Route = createFileRoute("/_auth")({ component: AuthLayout })

const POINTS = ["Every credit and payment, on both phones", "A photo of every mBoB or mPay transfer", "Nothing is ever deleted — crossed-out entries stay in the history"]

function AuthLayout() {
  const admin = isAdminHost()
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.25_0.06_266)] p-10 text-white lg:flex lg:flex-col">
        <div aria-hidden="true" className="absolute -top-40 -right-40 size-[32rem] rounded-full bg-[oklch(0.5_0.2_264/0.45)] blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-[oklch(0.55_0.13_200/0.25)] blur-3xl" />
        <Link to="/" className="relative">
          <Logo className="[&_.text-muted-foreground]:text-white/60" sub={admin ? "Operator console" : undefined} />
        </Link>
        <div className="relative mt-auto max-w-md">
          {admin ? (
            <>
              <p className="text-3xl leading-tight font-semibold tracking-tight">Subscriptions, shops and payments — in one place.</p>
              <p className="mt-4 text-white/65">For Bangkee staff. Shop owners and customers sign in at the app.</p>
            </>
          ) : (
            <>
              <p className="text-3xl leading-tight font-semibold tracking-tight">The credit book your shop and your customers share.</p>
              <ul className="mt-8 grid gap-3 text-white/80">
                {POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                      <CheckIcon className="size-3" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <p className="relative mt-12 text-xs text-white/40">Made for shops in Bhutan.</p>
      </aside>
      <div className="flex flex-col">
        <header className="flex h-16 items-center px-5 lg:hidden">
          <Link to="/">
            <Logo sub={admin ? "Operator console" : undefined} />
          </Link>
        </header>
        <main className="flex flex-1 flex-col items-center px-5 pt-6 pb-16 lg:justify-center lg:pt-16">
          <div className="mb-6 grid w-full max-w-sm gap-2 empty:hidden">
            <OfflineBanner />
            <FlashBanners />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
