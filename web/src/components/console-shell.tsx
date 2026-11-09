import { Link, useRouterState } from "@tanstack/react-router"
import {
  BellIcon,
  ChevronLeftIcon,
  ChevronsUpDownIcon,
  InboxIcon,
  LayoutGridIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareQuoteIcon,
  PanelLeftIcon,
  ReceiptTextIcon,
  SettingsIcon,
  StoreIcon,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"

import type { Me } from "@/api/types"
import { FlashBanners, OfflineBanner } from "@/components/banners"
import { LogoMark } from "@/components/brand"
import { Initial } from "@/components/kit"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { go } from "@/lib/go"
import { useLive } from "@/lib/live"
import { pageStore } from "@/lib/page"
import { signOut } from "@/lib/session"
import { cn } from "@/lib/utils"

// The operator console's frame, after shadcn's dashboard: a sidebar on the
// sidebar colour with the work grouped by what it is, the page inset beside
// it on a raised card, and a slim header that names the page. The sidebar
// folds to icons on a desktop (remembered on this device) and slides in
// from the left on a phone.

interface Item {
  label: string
  icon: LucideIcon
  path: string
  badge?: number
}

function groups(me: Me): { label?: string; items: Item[] }[] {
  return [
    { items: [{ label: "Overview", icon: LayoutGridIcon, path: "/" }] },
    {
      label: "Review",
      items: [
        { label: "Payments", icon: ReceiptTextIcon, path: "/subscription_payments", badge: me.badges.admin_payments },
        { label: "Feedback", icon: InboxIcon, path: "/feedback", badge: me.badges.admin_feedback },
        { label: "Testimonials", icon: MessageSquareQuoteIcon, path: "/testimonials", badge: me.badges.admin_testimonials },
      ],
    },
    { label: "Directory", items: [{ label: "Shops", icon: StoreIcon, path: "/all_shops" }] },
  ]
}

const FOLDED_KEY = "bangkee.console.folded"

function readFolded() {
  try {
    return localStorage.getItem(FOLDED_KEY) === "1"
  } catch {
    return false
  }
}

function Count({ count, folded }: { count?: number; folded?: boolean }) {
  if (!count) return null
  return folded ? (
    <span className="absolute top-1 right-1 size-2 rounded-full bg-owed" aria-label={`${count} waiting`} />
  ) : (
    <span className="tabular ml-auto rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{count}</span>
  )
}

function isCurrent(pathname: string, path: string) {
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/")
}

function NavLink({ item, pathname, folded, onNavigate }: { item: Item; pathname: string; folded: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  const current = isCurrent(pathname, item.path)
  const link = (
    <Link
      to={item.path as never}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
        current ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        folded && "justify-center px-0",
      )}
    >
      <Icon className={cn("size-4 shrink-0", current && "text-primary")} />
      {!folded && <span className="truncate">{item.label}</span>}
      <Count count={item.badge} folded={folded} />
    </Link>
  )
  if (!folded) return link
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">
        {item.label}
        {item.badge ? ` · ${item.badge}` : ""}
      </TooltipContent>
    </Tooltip>
  )
}

function SidebarBody({ me, folded, onNavigate }: { me: Me; folded: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <div className="flex h-full flex-col">
      <Link to="/" onClick={onNavigate} className={cn("flex h-14 items-center gap-2.5 px-3", folded && "justify-center px-0")}>
        <LogoMark className="size-7" />
        {!folded && (
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Bangkee</span>
            <span className="block text-xs text-muted-foreground">Operator console</span>
          </span>
        )}
      </Link>

      <nav aria-label="Console" className="flex-1 overflow-y-auto px-2 py-2">
        {groups(me).map((group, i) => (
          <div key={i} className="mb-4">
            {group.label && !folded && <div className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground/80">{group.label}</div>}
            {group.label && folded && <div className="mx-auto mb-2 h-px w-6 bg-border" />}
            <div className="grid gap-0.5">
              {group.items.map((item) => (
                <NavLink key={item.path} item={item} pathname={pathname} folded={folded} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="grid gap-0.5 px-2 pb-2">
        <NavLink item={{ label: "Settings", icon: SettingsIcon, path: "/settings" }} pathname={pathname} folded={folded} onNavigate={onNavigate} />
      </div>
      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn("flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted data-popup-open:bg-muted", folded && "justify-center")}
            aria-label="Your account"
          >
            <Initial text={me.user.initial} size="sm" src={me.user.photo_url} />
            {!folded && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{me.user.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{me.user.email_address}</span>
                </span>
                <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side={folded ? "right" : "top"} align="start" className="w-56">
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
    </div>
  )
}

export function ConsoleShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const page = pageStore.use()
  const [folded, setFolded] = useState(readFolded)
  const [menuOpen, setMenuOpen] = useState(false)
  useLive(me.user.id)

  const fold = () => {
    const next = !folded
    setFolded(next)
    try {
      localStorage.setItem(FOLDED_KEY, next ? "1" : "0")
    } catch {
      /* private mode */
    }
  }

  return (
    <div className="min-h-dvh bg-sidebar">
      <aside className={cn("no-print fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 md:block", folded ? "w-16" : "w-60")}>
        <SidebarBody me={me} folded={folded} />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Console menu</SheetTitle>
          <SidebarBody me={me} folded={false} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className={cn("transition-[padding] duration-200 md:py-2 md:pr-2 print:p-0", folded ? "md:pl-16" : "md:pl-60")}>
        <div className="flex min-h-dvh flex-col bg-background md:min-h-[calc(100dvh-1rem)] md:rounded-xl md:border md:shadow-xs print:border-0">
          <header className="no-print sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur md:rounded-t-xl md:px-4">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open the menu" className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted md:hidden">
              <MenuIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={fold}
              aria-label={folded ? "Expand the sidebar" : "Collapse the sidebar"}
              className="hidden size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
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
          </header>
          <main className="flex-1 px-4 py-5 md:px-6 md:py-6 print:p-0">
            <div className={cn("mx-auto w-full max-w-7xl", page.narrow && "max-w-2xl")}>
              <div className="mb-4 grid gap-2 empty:hidden">
                <OfflineBanner />
                <FlashBanners />
              </div>
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
