import { Link, useRouterState } from "@tanstack/react-router"
import { BellIcon, ChevronLeftIcon, ChevronsUpDownIcon, CreditCardIcon, EyeIcon, LogOutIcon, PanelLeftIcon, PlusIcon, SearchIcon, StoreIcon, UserRoundIcon } from "lucide-react"
import { useEffect, useState } from "react"

import type { Me } from "@/api/types"
import { FlashBanners, OfflineBanner, SubscriptionBanner } from "@/components/banners"
import { QueueSummary } from "@/components/queued-writes"
import { LogoMark } from "@/components/brand"
import { CommandPalette } from "@/components/command-palette"
import { ConsoleShell } from "@/components/console-shell"
import { InsetSidebar, type SideGroup, type SideItem } from "@/components/inset-sidebar"
import { Initial } from "@/components/kit"
import { helpItem, navItems, navRoot, sidebarSections, type NavItem } from "@/components/nav"
import { IosInstallSheet, PushPrompt } from "@/components/pwa"
import { RecordSheet } from "@/components/record-sheet"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { go } from "@/lib/go"
import { useLive } from "@/lib/live"
import { pageStore } from "@/lib/page"
import { onCommandKey, readFolded, storeFolded } from "@/lib/sidebar"
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
          <Initial text={me.user.initial} size="lg" src={me.user.photo_url} />
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

/** The frame around every signed-in screen: the console's for an operator, the app's for everyone else. */
export function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  return me.user.platform_admin ? <ConsoleShell me={me}>{children}</ConsoleShell> : <AppShell me={me}>{children}</AppShell>
}

// A desktop has the sidebar the console has too: whose shop this is, a
// search that finds any customer (⌘K), the work under small headings, and
// the page on a raised panel beside it under a slim header with the page's
// title and the one action a shopkeeper takes most — Record. A phone keeps
// its own top bar and tab bar, unchanged.
function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const page = pageStore.use()
  const active = navRoot(pathname, me)
  const [recording, setRecording] = useState(false)
  const [searching, setSearching] = useState(false)
  const [folded, setFolded] = useState(readFolded)
  const record = me.permissions.includes("record") && !me.user.platform_admin ? () => setRecording(true) : undefined
  useLive(me.user.id)
  useEffect(() => onCommandKey(() => setSearching(true)), [])

  const shopSide = !!me.shop && (me.user.role === "shop_owner" || me.user.role === "staff")
  const main: SideItem[] = navItems(me).filter((item) => item.key !== "settings")
  const sections = sidebarSections(me)
  const groups: SideGroup[] = [{ items: main }, ...sections]
  const bottom: SideItem[] = [...(shopSide ? [helpItem] : []), { label: "Profile", icon: UserRoundIcon, path: "/settings" }]
  const fold = () => {
    storeFolded(!folded)
    setFolded(!folded)
  }

  return (
    <div className="min-h-dvh md:bg-sidebar">
      <IosInstallSheet />
      <aside className={cn("no-print fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 md:block", folded ? "w-16" : "w-60")}>
        <InsetSidebar
          me={me}
          folded={folded}
          header={<Workspace me={me} folded={folded} />}
          top={<SearchButton folded={folded} customers={shopSide} onClick={() => setSearching(true)} />}
          groups={groups}
          bottom={bottom}
        />
      </aside>
      <div className={cn("transition-[padding] duration-200 print:p-0 md:py-2 md:pr-2", folded ? "md:pl-16" : "md:pl-60")}>
        <div className="md:flex md:min-h-[calc(100dvh-1rem)] md:flex-col md:rounded-xl md:border md:bg-background md:shadow-xs print:border-0">
          <Topbar me={me} />
          <header className="no-print sticky top-0 z-20 hidden h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:flex md:rounded-t-xl">
            <button
              type="button"
              onClick={fold}
              aria-label={folded ? "Expand the sidebar" : "Collapse the sidebar"}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelLeftIcon className="size-4" />
            </button>
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
            {page.back && (
              <Link to={page.back as never} aria-label="Back" className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted">
                <ChevronLeftIcon className="size-4" />
              </Link>
            )}
            <h1 className="min-w-0 flex-1 truncate text-base font-medium">{page.title ?? "Bangkee"}</h1>
            <Link
              to="/notifications"
              aria-label="Notifications"
              className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <BellIcon className="size-4" />
              {me.unread_notifications > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-owed" />}
            </Link>
            {record && (
              <Button size="sm" onClick={record} className="ml-1">
                <PlusIcon /> Record
              </Button>
            )}
          </header>
          {/* On a desktop a narrow screen keeps its measure but lines up under the title. */}
          <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 sm:px-6 md:max-w-7xl md:flex-1 md:px-6 md:py-6 print:max-w-none print:p-0">
            <div className={cn(page.narrow && "mx-auto max-w-2xl md:mx-0")}>
              <div className="mb-4 grid gap-2 empty:hidden">
                <OfflineBanner />
                {me.permissions.includes("record") && <QueueSummary />}
                <SubscriptionBanner me={me} />
                <FlashBanners />
              </div>
              {children}
            </div>
          </main>
        </div>
        <Tabbar me={me} active={active} onRecord={record} />
        {record && <RecordSheet open={recording} onOpenChange={setRecording} />}
        <CommandPalette open={searching} onOpenChange={setSearching} pages={[...groups.flatMap((g) => g.items), ...bottom]} customers={shopSide && me.permissions.includes("view")} />
        <PushPrompt me={me} />
      </div>
    </div>
  )
}

/** Whose workspace: the shop (with its quick menu), or the customer's own credit. */
function Workspace({ me, folded }: { me: Me; folded: boolean }) {
  const shop = me.shop
  const owns = me.permissions.includes("owner")
  const mark = shop ? <Initial text={shop.name} size="sm" /> : <LogoMark className="size-7" />
  const name = shop?.name ?? "Bangkee"
  const sub = shop ? (me.shop_role === "owner" ? (me.subscription ? `${me.subscription.plan_name} · ${me.subscription.status_label}` : "Your shop") : `Staff · ${me.shop_role}`) : "My credit"
  if (!shop || folded) {
    return (
      <Link to="/dashboard" className={cn("flex h-11 items-center gap-2.5 rounded-lg px-1.5", folded && "justify-center px-0")} aria-label={name}>
        {mark}
        {!folded && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{sub}</span>
          </span>
        )}
      </Link>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-11 w-full items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-muted data-popup-open:bg-muted">
        {mark}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block truncate text-xs text-muted-foreground capitalize">{sub}</span>
        </span>
        <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem onClick={() => go(`/shops/${shop.id}`)}>
          <EyeIcon /> See your shop as customers do
        </DropdownMenuItem>
        {owns && (
          <>
            <DropdownMenuItem onClick={() => go("/shop_profile")}>
              <StoreIcon /> Shop profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/subscription")}>
              <CreditCardIcon /> Billing
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The search box in the sidebar: opens the ⌘K palette. */
function SearchButton({ folded, customers, onClick }: { folded: boolean; customers: boolean; onClick: () => void }) {
  if (folded) {
    return (
      <button type="button" onClick={onClick} aria-label="Search" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
        <SearchIcon className="size-4" />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:text-foreground"
    >
      <SearchIcon className="size-3.5" />
      <span className="flex-1 text-left">{customers ? "Find a customer…" : "Search…"}</span>
      <kbd className="rounded border bg-muted px-1 font-mono text-[0.625rem]">⌘K</kbd>
    </button>
  )
}
