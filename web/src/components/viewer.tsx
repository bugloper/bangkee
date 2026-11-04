import { XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

// Opens a payment screenshot full-screen. The owner is comparing a number on
// a phone photo against their bank — sending them to a new browser tab loses
// the queue they were working through.
export function Thumb({ url, caption, size = 64, label, className }: { url: string; caption: string; size?: number; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", escape)
    return () => document.removeEventListener("keydown", escape)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ?? "View the screenshot"}
        className={cn("shrink-0 overflow-hidden rounded-xl border bg-muted ring-offset-2 transition hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}
        style={{ width: size, height: size }}
      >
        <img src={url} className="size-full object-cover" alt="" loading="lazy" />
      </button>
      {open && (
        // Clicking the backdrop closes; clicking the image itself does not.
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4 backdrop-blur-sm"
          onClick={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" autoFocus className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <XIcon className="size-5" />
          </button>
          <img className="max-h-[82vh] max-w-full rounded-lg object-contain shadow-2xl" src={url} alt={caption || "Payment screenshot"} />
          {caption && <div className="text-sm text-white/80">{caption}</div>}
        </div>
      )}
    </>
  )
}
