import { CheckIcon, ChevronDownIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useState } from "react"

import { ActionSheet } from "@/components/action-sheet"
import { Input } from "@/components/ui/input"
import { COMMON_CATEGORIES, matches } from "@/lib/catalog"
import { cn } from "@/lib/utils"

/**
 * An item's category. Tapping the field opens a sheet: a search box over the
 * shop's own categories and the common ones, and — when what was typed is
 * not there — a row to add it as a new one.
 */
export function CategoryPicker({ id, value, onChange, yours }: { id?: string; value: string; onChange: (value: string) => void; yours: string[] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const current = value.trim()
  const typed = q.trim()

  const sections = [{ title: "Your categories", categories: yours }, ...COMMON_CATEGORIES.map((g) => ({ title: g.group, categories: g.categories.filter((c) => !yours.includes(c)) }))]
    .map((s) => ({ ...s, categories: s.categories.filter((c) => matches(typed, c)) }))
    .filter((s) => s.categories.length > 0)
  const exists = sections.some((s) => s.categories.some((c) => c.toLowerCase() === typed.toLowerCase()))

  const choose = (category: string) => {
    onChange(category)
    setOpen(false)
  }

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => {
          setQ("")
          setOpen(true)
        }}
        className="flex h-12 w-full items-center gap-2 rounded-2xl border bg-card px-4 text-left text-[0.9375rem] transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className={cn("min-w-0 flex-1 truncate", current ? "font-medium" : "text-muted-foreground")}>{current || "Choose"}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <ActionSheet open={open} onOpenChange={setOpen} title="Category" label="Choose a category">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search categories" placeholder="Search or type a new one" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-2 mt-3 h-[min(55vh,26rem)] overflow-y-auto overscroll-contain px-2">
          {!typed && <Option label="No category" selected={!current} muted onClick={() => choose("")} />}
          {sections.map((section) => (
            <section key={section.title} className="mt-2 first:mt-0">
              <h3 className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{section.title}</h3>
              {section.categories.map((c) => (
                <Option key={c} label={c} selected={c === current} onClick={() => choose(c)} />
              ))}
            </section>
          ))}
          {typed && !exists && (
            <button type="button" onClick={() => choose(typed)} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-accent">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent">
                <PlusIcon className="size-4" />
              </span>
              Add “{typed}”
            </button>
          )}
        </div>
      </ActionSheet>
    </>
  )
}

function Option({ label, selected, muted, onClick }: { label: string; selected: boolean; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
        selected && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
        muted && !selected && "text-muted-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <CheckIcon className="size-4 shrink-0 text-primary" />}
    </button>
  )
}
