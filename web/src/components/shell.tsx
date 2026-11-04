import { Link, useRouterState } from "@tanstack/react-router"
import { BellIcon, ChevronLeftIcon, ChevronsUpDownIcon, LogOutIcon, SettingsIcon } from "lucide-react"

import type { Me } from "@/api/types"
import { FlashBanners, OfflineBanner, SubscriptionBanner } from "@/components/banners"
import { Logo } from "@/components/brand"
import { Initial } from "@/components/kit"
import { navItems, navRoot } from "@/components/nav"
import { IosInstallSheet, PushPrompt } from "@/components/pwa"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { go } from "@/lib/go"
import { isAdminHost } from "@/lib/host"
import { pageStore } from "@/lib/page"
import { signOut } from "@/lib/session"
import { cn } from "@/lib/utils"

function Badge({ count, className }: { count?: number; className?: string }) {
  if (!count || count <= 0) return null
  return (
    <span className={cn("tabular inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-owed px-1 text-[0.625rem] font-semibold text-white", className)}>
      {count > 99 ? "99+" : count}
    </span>
  )
}

function subtitle(me: Me) {
  if (isAdminHost()) return "Operator console"
  return me.shop?.name ?? "My credit"
}

function Sidebar({ me, active }: { me: Me; active?: string }) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-16 items-center px-5">
        <Logo sub={subtitle(me)} />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {navItems(me).map((item) => {
          const Icon = item.icon
          const current = active === item.key
          return (
            <Link
              key={item.key}
              to={item.path as never}
              className={cn(
                "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                current ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-[1.0625rem]", current ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              <span className="flex-1">{item.label}</span>
              <Badge count={item.badge} />
            </Link>
          )
        })}
      </nav>
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted data-popup-open:bg-muted">
            <Initial text={me.user.initial} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me.user.display_name}</span>
              <span className="block truncate text-xs text-muted-foreground">{me.user.email_address ?? me.user.phone}</span>
            </span>
            <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem onClick={() => go("/settings")}>
              <SettingsIcon /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut()}>
              <LogOutIcon /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

function Topbar({ me }: { me: Me }) {
  const page = pageStore.use()
  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-1 border-b bg-background/80 px-2 backdrop-blur-xl supports-backdrop-filter:bg-background/70 sm:px-4 md:h-16 md:px-8">
      {page.back && (
        <Link to={page.back as never} aria-label="Back" className="-ml-1 inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ChevronLeftIcon className="size-5" />
        </Link>
      )}
      <div className={cn("min-w-0 flex-1 truncate text-base font-semibold tracking-tight md:text-lg", !page.back && "pl-2 md:pl-0")}>{page.title ?? "Bangkee"}</div>
      <Link to="/notifications" aria-label="Notifications" className="relative inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <BellIcon className="size-5" />
        <Badge count={me.unread_notifications} className="absolute top-1.5 right-1.5" />
      </Link>
      <Link to="/settings" aria-label="Your account" className="ml-0.5 rounded-full md:hidden">
        <Initial text={me.user.initial} size="sm" />
      </Link>
    </header>
  )
}

function Tabbar({ me, active }: { me: Me; active?: string }) {
  const items = navItems(me)
  return (
    <nav aria-label="Main" className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = item.icon
          const current = active === item.key
          return (
            <Link key={item.key} to={item.path as never} className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors", current ? "text-primary" : "text-muted-foreground")}>
              <span className="relative">
                <Icon className="size-[1.375rem]" strokeWidth={current ? 2.25 : 1.75} />
                <Badge count={item.badge} className="absolute -top-1.5 -right-2.5" />
              </span>
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const page = pageStore.use()
  const active = navRoot(pathname, me)

  return (
    <div className="min-h-dvh">
      <IosInstallSheet />
      <Sidebar me={me} active={active} />
      <div className="md:pl-64 print:pl-0">
        <Topbar me={me} />
        <main className={cn("mx-auto w-full px-4 pt-4 pb-28 sm:px-6 md:px-8 md:pt-6 md:pb-12 print:max-w-none print:p-0", page.narrow ? "max-w-2xl" : "max-w-6xl")}>
          <div className="mb-4 grid gap-2 empty:hidden">
            <OfflineBanner />
            <SubscriptionBanner me={me} />
            <FlashBanners />
          </div>
          {children}
        </main>
        <Tabbar me={me} active={active} />
        <PushPrompt me={me} />
      </div>
    </div>
  )
}
