import { Link } from "@tanstack/react-router"
import { BellIcon, ChevronLeftIcon, InboxIcon, LayoutGridIcon, MenuIcon, MessageSquareQuoteIcon, PanelLeftIcon, ReceiptTextIcon, SettingsIcon, StoreIcon } from "lucide-react"
import { useState } from "react"

import type { Me } from "@/api/types"
import { FlashBanners, OfflineBanner } from "@/components/banners"
import { LogoMark } from "@/components/brand"
import { InsetSidebar, type SideGroup } from "@/components/inset-sidebar"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useLive } from "@/lib/live"
import { pageStore } from "@/lib/page"
import { readFolded, storeFolded } from "@/lib/sidebar"
import { cn } from "@/lib/utils"

// The operator console's frame, after shadcn's dashboard: a sidebar on the
// sidebar colour with the work grouped by what it is, the page inset beside
// it on a raised card, and a slim header that names the page. The sidebar
// folds to icons on a desktop (remembered on this device) and slides in
// from the left on a phone.

function groups(me: Me): SideGroup[] {
  return [
    { items: [{ label: "Overview", icon: LayoutGridIcon, path: "/dashboard" }] },
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

function SidebarBody({ me, folded, onNavigate }: { me: Me; folded: boolean; onNavigate?: () => void }) {
  return (
    <InsetSidebar
      me={me}
      folded={folded}
      onNavigate={onNavigate}
      header={
        <Link to="/dashboard" onClick={onNavigate} className={cn("flex h-11 items-center gap-2.5 rounded-lg px-1.5", folded && "justify-center px-0")}>
          <LogoMark className="size-7" />
          {!folded && (
            <span className="leading-tight">
              <span className="block text-sm font-semibold">Bangkee</span>
              <span className="block text-xs text-muted-foreground">Operator console</span>
            </span>
          )}
        </Link>
      }
      groups={groups(me)}
      bottom={[{ label: "Settings", icon: SettingsIcon, path: "/settings" }]}
    />
  )
}

export function ConsoleShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const page = pageStore.use()
  const [folded, setFolded] = useState(readFolded)
  const [menuOpen, setMenuOpen] = useState(false)
  useLive(me.user.id)

  const fold = () => {
    storeFolded(!folded)
    setFolded(!folded)
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
