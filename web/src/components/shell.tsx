import { Link, useRouterState } from "@tanstack/react-router"
import { BellIcon, ChevronLeftIcon, ChevronsUpDownIcon, LogOutIcon, PlusIcon, SettingsIcon } from "lucide-react"
import { useState } from "react"

import type { Me } from "@/api/types"
import { FlashBanners, OfflineBanner, SubscriptionBanner } from "@/components/banners"
import { Logo } from "@/components/brand"
import { Initial } from "@/components/kit"
import { navItems, navRoot, type NavItem } from "@/components/nav"
import { IosInstallSheet, PushPrompt } from "@/components/pwa"
import { RecordSheet } from "@/components/record-sheet"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { go } from "@/lib/go"
import { isAdminHost } from "@/lib/host"
import { useLive } from "@/lib/live"
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

function Sidebar({ me, active, onRecord }: { me: Me; active?: string; onRecord?: () => void }) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-18 items-center px-5">
        <Logo sub={subtitle(me)} />
      </div>
      {onRecord && (
        <div className="px-3 pb-2">
          <Button className="w-full" size="lg" onClick={onRecord}>
            <PlusIcon /> Record
          </Button>
        </div>
      )}
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {navItems(me).map((item) => {
          const Icon = item.icon
          const current = active === item.key
          return (
            <Link
              key={item.key}
              to={item.path as never}
              className={cn(
                "group flex h-10 items-center gap-3 rounded-full px-3.5 text-sm font-medium transition-colors",
                current ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-[1.0625rem]", current ? "text-background" : "text-muted-foreground group-hover:text-foreground")} />
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

/** A round button in the header, the shot's way of framing a centred title. */
const roundButton = "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border bg-card text-foreground transition-colors hover:bg-muted"

function Topbar({ me }: { me: Me }) {
  const page = pageStore.use()
  return (
    <header className="no-print sticky top-0 z-20 grid h-16 grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 bg-background/85 px-4 backdrop-blur-xl sm:px-6 md:hidden">
      {page.back ? (
        <Link to={page.back as never} aria-label="Back" className={roundButton}>
          <ChevronLeftIcon className="size-5" />
        </Link>
      ) : (
        <Link to="/settings" aria-label="Your account" className="rounded-full md:invisible">
          <Initial text={me.user.initial} size="lg" />
        </Link>
      )}
      <div className="min-w-0 truncate text-center text-lg font-semibold tracking-tight">{page.title ?? "Bangkee"}</div>
      <Link to="/notifications" aria-label="Notifications" className={roundButton}>
        <BellIcon className="size-5" />
        <Badge count={me.unread_notifications} className="absolute -top-0.5 -right-0.5" />
      </Link>
    </header>
  )
}

/** The desktop header: the title on the left, over the content it names. */
function DesktopTopbar({ me }: { me: Me }) {
  const page = pageStore.use()
  return (
    <header className="no-print sticky top-0 z-20 hidden h-20 items-center border-b border-transparent bg-background/85 px-8 backdrop-blur-xl md:flex">
      <div className="mx-auto flex w-full max-w-[68rem] items-center gap-3">
        {page.back && (
          <Link to={page.back as never} aria-label="Back" className={cn(roundButton, "size-10")}>
            <ChevronLeftIcon className="size-5" />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">{page.title ?? "Bangkee"}</h1>
        <Link to="/notifications" aria-label="Notifications" className={cn(roundButton, "size-10")}>
          <BellIcon className="size-[1.125rem]" />
          <Badge count={me.unread_notifications} className="absolute -top-0.5 -right-0.5" />
        </Link>
      </div>
    </header>
  )
}

/** The bar along the bottom of a phone; an owner's has the round + in the middle. */
function Tabbar({ me, active, onRecord }: { me: Me; active?: string; onRecord?: () => void }) {
  const items = navItems(me)
  const half = Math.ceil(items.length / 2)
  const slots: (NavItem | "record")[] = onRecord ? [...items.slice(0, half), "record", ...items.slice(half)] : items
  return (
    <nav aria-label="Main" className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
        {slots.map((item) => {
          if (item === "record") {
            return (
              <div key="record" className="flex justify-center">
                <button
                  type="button"
                  aria-label="Record"
                  onClick={onRecord}
                  className="-mt-6 flex size-15 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-6 shadow-primary/40 ring-background transition-transform active:scale-95"
                >
                  <PlusIcon className="size-7" strokeWidth={2.5} />
                </button>
              </div>
            )
          }
          const Icon = item.icon
          const current = active === item.key
          return (
            <Link
              key={item.key}
              to={item.path as never}
              className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors", current ? "text-foreground" : "text-muted-foreground")}
            >
              <span className="relative">
                <Icon className="size-[1.375rem]" strokeWidth={current ? 2.5 : 1.75} />
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
  const [recording, setRecording] = useState(false)
  const record = me.user.role === "shop_owner" && !isAdminHost() ? () => setRecording(true) : undefined
  useLive(me.user.id)

  return (
    <div className="min-h-dvh">
      <IosInstallSheet />
      <Sidebar me={me} active={active} onRecord={record} />
      <div className="md:pl-64 print:pl-0">
        <Topbar me={me} />
        <DesktopTopbar me={me} />
        {/* On a desktop a narrow screen keeps its measure but lines up under the title. */}
        <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 sm:px-6 md:px-8 md:pt-2 md:pb-12 print:max-w-none print:p-0">
          <div className={cn(page.narrow && "mx-auto max-w-2xl md:mx-0")}>
            <div className="mb-4 grid gap-2 empty:hidden">
              <OfflineBanner />
              <SubscriptionBanner me={me} />
              <FlashBanners />
            </div>
            {children}
          </div>
        </main>
        <Tabbar me={me} active={active} onRecord={record} />
        {record && <RecordSheet open={recording} onOpenChange={setRecording} />}
        <PushPrompt me={me} />
      </div>
    </div>
  )
}
