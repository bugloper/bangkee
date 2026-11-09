import { useQuery } from "@tanstack/react-query"
import { CornerDownLeftIcon, SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { api } from "@/api/client"
import type { SideItem } from "@/components/inset-sidebar"
import { Initial, Money } from "@/components/kit"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { go } from "@/lib/go"
import { cn } from "@/lib/utils"

// ⌘K: go anywhere by typing. Every page in the sidebar, and — for a shop —
// every customer in the book by name or phone, so the one at the counter is
// two keystrokes away.

type Result = { key: string; label: string; detail?: React.ReactNode; leading: React.ReactNode; href: string }

export function CommandPalette({ open, onOpenChange, pages, customers }: { open: boolean; onOpenChange: (open: boolean) => void; pages: SideItem[]; customers: boolean }) {
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)
  const q = query.trim()
  const found = useQuery({ queryKey: ["accounts", q, ""], queryFn: () => api.accounts({ q }), enabled: open && customers && q.length > 0, placeholderData: (previous) => previous })

  const results: Result[] = useMemo(() => {
    const lower = q.toLowerCase()
    const pageResults = pages
      .filter((page) => !lower || page.label.toLowerCase().includes(lower))
      .map((page) => ({
        key: `page:${page.path}`,
        label: page.label,
        leading: (
          <span className="flex size-7 items-center justify-center rounded-md border bg-muted/60 text-muted-foreground">
            <page.icon className="size-3.5" />
          </span>
        ),
        href: page.path,
      }))
    const customerResults =
      customers && q
        ? (found.data?.accounts ?? [])
            .slice(0, 8)
            .map((a) => ({
              key: `account:${a.id}`,
              label: a.display_name,
              detail: <Money cents={a.balance_cents} tone="auto" className="text-xs" />,
              leading: <Initial text={a.display_name} size="sm" src={a.customer_photo_url} />,
              href: `/accounts/${a.id}`,
            }))
        : []
    return [...customerResults, ...pageResults]
  }, [q, pages, customers, found.data])

  const choose = (result: Result | undefined) => {
    if (!result) return
    onOpenChange(false)
    go(result.href)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setQuery("")
          setCursor(0)
        }
      }}
    >
      <DialogContent showCloseButton={false} className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setCursor((c) => Math.min(results.length - 1, c + 1))
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              } else if (event.key === "Enter") {
                event.preventDefault()
                choose(results[cursor])
              }
            }}
            placeholder={customers ? "Search customers or pages…" : "Search pages…"}
            aria-label="Search"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">Esc</kbd>
        </div>
        <div role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{found.isFetching ? "Searching…" : "Nothing matches."}</p>
          ) : (
            results.map((result, i) => (
              <button
                key={result.key}
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseMove={() => setCursor(i)}
                onClick={() => choose(result)}
                className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm", i === cursor && "bg-muted")}
              >
                {result.leading}
                <span className="min-w-0 flex-1 truncate">{result.label}</span>
                {result.detail}
                {i === cursor && <CornerDownLeftIcon className="size-3.5 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
