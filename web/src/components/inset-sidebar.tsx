import { Link, useRouterState } from "@tanstack/react-router"
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon, type LucideIcon } from "lucide-react"

import type { Me } from "@/api/types"
import { Initial } from "@/components/kit"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { go } from "@/lib/go"
import { signOut } from "@/lib/session"
import { isCurrent } from "@/lib/sidebar"
import { cn } from "@/lib/utils"

// The desktop sidebar the app and the console share, after shadcn-admin and
// Square UI: it sits on the sidebar colour beside the page's raised panel,
// opens with whose workspace this is, groups the destinations under small
// labels, and ends with the person. Folded, it is a column of icons that
// name themselves on hover.

export interface SideItem {
  label: string
  icon: LucideIcon
  path: string
  badge?: number
}

export interface SideGroup {
  label?: string
  items: SideItem[]
}

function Count({ count, folded }: { count?: number; folded: boolean }) {
  if (!count) return null
  return folded ? (
    <span className="absolute top-1 right-1 size-2 rounded-full bg-owed" aria-label={`${count} waiting`} />
  ) : (
    <span className="tabular ml-auto rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{count > 99 ? "99+" : count}</span>
  )
}

export function SideLink({ item, current, folded, onNavigate }: { item: SideItem; current: boolean; folded: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  const link = (
    <Link
      to={item.path as never}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
        current ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        folded && "w-8 justify-center px-0",
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

export function InsetSidebar({
  me,
  header,
  top,
  groups,
  bottom = [],
  folded,
  onNavigate,
}: {
  me: Me
  header: React.ReactNode // whose workspace: the shop, or the console
  top?: React.ReactNode // search and the like, under the header
  groups: SideGroup[]
  bottom?: SideItem[] // above the person: help, settings
  folded: boolean
  onNavigate?: () => void
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <div className="flex h-full flex-col">
      <div className={cn("px-2 pt-2.5", folded && "flex justify-center")}>{header}</div>
      {top && <div className={cn("px-2 pt-2", folded && "flex flex-col items-center")}>{top}</div>}

      <nav aria-label="Main" className={cn("flex-1 overflow-y-auto px-2 py-3", folded && "flex flex-col items-center")}>
        {groups.map((group, i) => (
          <div key={group.label ?? i} className="mb-4 w-full">
            {group.label && !folded && <div className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground/80">{group.label}</div>}
            {group.label && folded && <div className="mx-auto mb-2 h-px w-6 bg-border" />}
            <div className={cn("grid gap-0.5", folded && "justify-items-center")}>
              {group.items.map((item) => (
                <SideLink key={item.path} item={item} current={isCurrent(pathname, item.path)} folded={folded} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {bottom.length > 0 && (
        <div className={cn("grid gap-0.5 px-2 pb-2", folded && "justify-items-center")}>
          {bottom.map((item) => (
            <SideLink key={item.path} item={item} current={isCurrent(pathname, item.path)} folded={folded} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Your account"
            className={cn("flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted data-popup-open:bg-muted", folded && "justify-center")}
          >
            <Initial text={me.user.initial} size="sm" src={me.user.photo_url} />
            {!folded && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{me.user.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{me.user.email_address ?? me.user.phone}</span>
                </span>
                <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side={folded ? "right" : "top"} align="start" className="w-56">
            <DropdownMenuItem onClick={() => go("/settings")}>
              <SettingsIcon /> Profile & settings
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
