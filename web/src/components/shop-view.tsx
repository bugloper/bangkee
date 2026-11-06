import { ChevronRightIcon, ClockIcon, MapPinIcon, NavigationIcon, PencilIcon, PhoneIcon, SearchIcon } from "lucide-react"
import { lazy, Suspense, useState } from "react"

import type { MenuGroup, ShopDirectory, ShopPage, ShopProfile } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { Chips, ItemThumb } from "@/components/catalog"
import { Empty, Initial, Panel, SectionLabel } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { matches } from "@/lib/catalog"
import { ngultrum, pluralize } from "@/lib/money"
import { cn } from "@/lib/utils"

// A shop as customers see it, wherever it is shown: in the app (shops/$id)
// and to visitors from the homepage (shop.$id). One look in both places.

// Leaflet loads only when a shop has a pin to show.
const ShopMap = lazy(() => import("@/components/shop-map").then((m) => ({ default: m.ShopMap })))

/** Directions in the phone's maps app (Google Maps, or the browser's). */
const directionsURL = (latitude: number, longitude: number) => `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`

/** Past this many items, a search box helps find one. */
const SEARCH_FROM = 9

/** Who the shop is: photo, type, about, where and when, the map, and how to reach it. */
export function ShopHeader({ shop, mine }: { shop: ShopProfile; mine: boolean }) {
  return (
    <Panel>
      {mine && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-accent/60 px-3.5 py-2.5 text-sm text-accent-foreground">
          This is how customers see your shop.
          <AppLink href="/shop_profile" className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline">
            <PencilIcon className="size-3.5" /> Edit
          </AppLink>
        </div>
      )}
      <div className="flex items-center gap-3.5">
        <Initial text={shop.name} size="xl" src={shop.photo_url} />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{shop.name}</h1>
          <div className="text-sm text-muted-foreground">{shop.kind_label}</div>
        </div>
      </div>
      {shop.about && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{shop.about}</p>}
      {(shop.location || shop.hours) && (
        <div className="mt-3 grid gap-1.5 text-sm text-muted-foreground">
          {shop.location && (
            <span className="flex items-start gap-2">
              <MapPinIcon className="mt-0.5 size-4 shrink-0" /> {shop.location}
            </span>
          )}
          {shop.hours && (
            <span className="flex items-start gap-2">
              <ClockIcon className="mt-0.5 size-4 shrink-0" /> {shop.hours}
            </span>
          )}
        </div>
      )}
      {shop.latitude != null && shop.longitude != null && (
        <div className="mt-4">
          <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-muted" />}>
            <ShopMap pin={{ latitude: shop.latitude, longitude: shop.longitude }} name={shop.name} />
          </Suspense>
        </div>
      )}
      {(shop.phone || shop.latitude != null) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {shop.latitude != null && shop.longitude != null && (
            <a href={directionsURL(shop.latitude, shop.longitude)} target="_blank" rel="noreferrer" className={buttonVariants()}>
              <NavigationIcon /> Directions
            </a>
          )}
          {shop.phone && (
            <a href={`tel:${shop.phone.replace(/\s/g, "")}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              <PhoneIcon /> Call {shop.phone}
            </a>
          )}
        </div>
      )}
    </Panel>
  )
}

/** What the shop sells: search past a few items, a chip per category, prices and what is out of stock. */
export function ShopMenu({ data }: { data: ShopPage }) {
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const count = data.menu.reduce((n, g) => n + g.items.length, 0)
  const shown = data.menu
    .filter((g) => !category || g.category === category)
    .map((g) => ({ ...g, items: g.items.filter((item) => matches(q, item.name, g.category)) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="grid gap-4">
      {count >= SEARCH_FROM && (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label={`Search ${data.shop.name}`} placeholder="Search this shop" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {data.menu.length > 1 && (
        <Chips label="Category" chips={[{ key: "", label: "All" }, ...data.menu.map((g) => ({ key: g.category, label: g.category, count: g.items.length }))]} value={category} onChange={setCategory} />
      )}

      {shown.map((group) => (
        <Group key={group.category} group={group} />
      ))}
      {count === 0 ? (
        <Panel>
          <Empty title="No items listed yet">{data.mine ? "Add your items and they show here." : "This shop has not listed anything yet."}</Empty>
        </Panel>
      ) : (
        shown.length === 0 && (
          <Panel>
            <Empty icon={SearchIcon} title="Nothing matches">
              No item called “{q.trim()}”{category && ` in ${category}`}.
            </Empty>
          </Panel>
        )
      )}
    </div>
  )
}

/** A category: photo cards when the shop has photos for it, a plain list when not. */
function Group({ group }: { group: MenuGroup }) {
  const photos = group.items.some((item) => item.image_url)
  return (
    <section className="grid gap-2">
      <SectionLabel>{group.category}</SectionLabel>
      {photos ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {group.items.map((item) => (
            <div key={item.id} className="overflow-hidden rounded-[1.25rem] border bg-card">
              <ItemThumb src={item.image_url} className={cn("aspect-square w-full rounded-none", !item.available && "opacity-50 grayscale")} />
              <div className="grid gap-0.5 p-3">
                <div className={cn("line-clamp-2 text-sm font-medium", !item.available && "text-muted-foreground")}>{item.name}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="tabular text-sm font-semibold">{ngultrum(item.price_cents)}</span>
                  {!item.available && <Badge variant="muted">Out of stock</Badge>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Panel flush>
          <div className="divide-y">
            {group.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className={cn("min-w-0 flex-1 text-sm font-medium", !item.available && "text-muted-foreground")}>{item.name}</div>
                {!item.available && <Badge variant="muted">Out of stock</Badge>}
                <div className={cn("tabular shrink-0 text-sm font-semibold", !item.available && "text-muted-foreground")}>{ngultrum(item.price_cents)}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </section>
  )
}

/** One shop in a list of shops: photo, type, town and how many items. */
export function ShopCard({ shop, href }: { shop: ShopDirectory["shops"][number]; href: string }) {
  return (
    <AppLink href={href} className="group flex items-center gap-3 rounded-[1.25rem] border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40">
      <Initial text={shop.name} size="lg" src={shop.photo_url} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{shop.name}</span>
        <span className="block truncate text-sm text-muted-foreground">{shop.kind_label}</span>
        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {shop.location && (
            <>
              <MapPinIcon className="size-3.5 shrink-0" />
              <span className="truncate">{shop.location}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="shrink-0">{pluralize(shop.items_count, "item")}</span>
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </AppLink>
  )
}
