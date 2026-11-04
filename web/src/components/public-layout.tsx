import { FlashBanners, OfflineBanner } from "@/components/banners"
import { LogoMark } from "@/components/brand"

// Deliberately not the app shell: a diner is not signing in, and showing
// them navigation for an app they do not have is noise.
export function PublicLayout({ shop, table, children }: { shop?: string; table?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <LogoMark className="size-7" />
          <div className="min-w-0 flex-1 truncate font-semibold tracking-tight">{shop ?? "Bangkee"}</div>
          {table && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{table}</span>}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-32">
        <div className="mb-4 grid gap-2 empty:hidden">
          <OfflineBanner />
          <FlashBanners />
        </div>
        {children}
      </main>
    </div>
  )
}
