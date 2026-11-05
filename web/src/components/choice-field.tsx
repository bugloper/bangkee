import { CheckIcon, ChevronDownIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useState } from "react"

import { ActionSheet } from "@/components/action-sheet"
import { Input } from "@/components/ui/input"
import { matches } from "@/lib/catalog"
import { cn } from "@/lib/utils"

export interface Choice {
  value: string
  label: string
}

export interface ChoiceGroup {
  title?: string
  choices: Choice[]
}

/** Past this many choices, the sheet gets a search box. */
const SEARCH_FROM = 9

/**
 * The app's dropdown: a field that opens a sheet of choices — at the bottom
 * of a phone, under the thumb — instead of the browser's plain list. Long
 * lists get a search box; with `allowNew`, what was typed there can be
 * chosen as a new value.
 */
export function ChoiceField({
  id,
  value,
  onChange,
  title,
  groups,
  placeholder = "Choose",
  none,
  allowNew,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  title: string
  groups: ChoiceGroup[]
  placeholder?: string
  /** A first choice meaning "none of these", whose value is "". */
  none?: string
  allowNew?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const all = groups.flatMap((g) => g.choices)
  const searchable = allowNew || all.length >= SEARCH_FROM
  const typed = q.trim()
  const currentLabel = all.find((c) => c.value === value)?.label ?? value

  const shown = groups.map((g) => ({ ...g, choices: g.choices.filter((c) => matches(typed, c.label)) })).filter((g) => g.choices.length > 0)
  const exists = all.some((c) => c.label.toLowerCase() === typed.toLowerCase())

  const choose = (next: string) => {
    onChange(next)
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
        <span className={cn("min-w-0 flex-1 truncate", value ? "font-medium" : "text-muted-foreground")}>{value ? currentLabel : (none ?? placeholder)}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <ActionSheet open={open} onOpenChange={setOpen} title={title} label={title}>
        {searchable && (
          <div className="relative mb-3">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label={`Search ${title.toLowerCase()}`}
              placeholder={allowNew ? "Search or type a new one" : "Search"}
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        )}
        <div className={cn("-mx-2 overflow-y-auto overscroll-contain px-2", searchable ? "h-[min(55vh,26rem)]" : "max-h-[60vh]")}>
          {none !== undefined && !typed && <Option label={none} selected={!value} muted onClick={() => choose("")} />}
          {shown.map((group, i) => (
            <section key={group.title ?? i} className={cn(group.title && "mt-2 first:mt-0")}>
              {group.title && <h3 className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</h3>}
              {group.choices.map((c) => (
                <Option key={c.value} label={c.label} selected={c.value === value} onClick={() => choose(c.value)} />
              ))}
            </section>
          ))}
          {allowNew && typed && !exists && (
            <button type="button" onClick={() => choose(typed)} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-accent">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent">
                <PlusIcon className="size-4" />
              </span>
              Add “{typed}”
            </button>
          )}
          {!allowNew && typed && shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing called “{typed}”.</p>}
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
        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[0.9375rem] transition-colors hover:bg-muted",
        selected && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
        muted && !selected && "text-muted-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <CheckIcon className="size-4 shrink-0 text-primary" />}
    </button>
  )
}
